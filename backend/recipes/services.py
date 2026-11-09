import json
import logging
import smtplib
from collections import Counter, defaultdict
from collections.abc import Iterable
from dataclasses import dataclass
from decimal import Decimal
from functools import partial
from pathlib import Path
from typing import Any, Literal

from django.conf import settings
from django.contrib.auth.models import AnonymousUser
from django.core.exceptions import NON_FIELD_ERRORS, ValidationError
from django.core.mail import send_mail
from django.db import IntegrityError, models, transaction
from django.template.loader import render_to_string
from django.utils import timezone
from django.utils.text import slugify

from households.models import User
from recipes.models import (
    RULED_OUT_BY,
    Course,
    Cuisine,
    DietTag,
    Equipment,
    Ingredient,
    IngredientGroup,
    IngredientLine,
    IngredientStatus,
    IngredientSynonym,
    Moderation,
    Recipe,
    Report,
    ReportReason,
    ShareLink,
    Step,
    Visibility,
)
from recipes.photo_store import delete_photo
from recipes.signals import counting_saves

CATALOGUE_PATH = settings.BASE_DIR / 'recipes' / 'catalogue.json'

logger = logging.getLogger(__name__)

Record = dict[str, Any]


class CatalogueError(Exception):
    """The catalogue file says something the database can't hold."""


@dataclass(frozen=True)
class LoadedCatalogue:
    recipes: int
    ingredients: int
    equipment: int


@dataclass(frozen=True)
class IngredientList:
    """A recipe's ingredient lines as the form sends them: the lines above every group, then each group with its
    own. A line is {amount, amount_max, unit, ingredient: Ingredient, note, optional, original_text}; a group is
    {name, lines}."""

    lines: list[Record]
    groups: list[Record]


@dataclass(frozen=True)
class _Names:
    cuisines: dict[str, Cuisine]
    courses: dict[str, Course]
    equipment: dict[str, Equipment]
    ingredients: dict[str, Ingredient]


def load_catalogue(path: Path = CATALOGUE_PATH) -> LoadedCatalogue:
    """Makes the catalogue's recipes, ingredients and equipment what the file says, adding, changing and removing."""
    catalogue = _read(path)
    with transaction.atomic():
        names = _Names(
            cuisines=_by_name(Cuisine.objects.all()),
            courses=_by_name(Course.objects.all()),
            equipment=_load_named(Equipment, [{'name': name} for name in catalogue['equipment']], 'Equipment', set()),
            ingredients=_load_named(Ingredient, catalogue['ingredients'], 'Ingredient', {'synonyms'}),
        )
        _load_synonyms(names.ingredients, catalogue['ingredients'])
        recipes = _load_recipes(catalogue['recipes'], names)
        # Catalogue recipes the file no longer lists go; household recipes aren't the file's.
        Recipe.objects.catalogue().exclude(pk__in=[recipe.pk for recipe in recipes]).delete()
        Equipment.objects.exclude(pk__in=[row.pk for row in names.equipment.values()]).delete()
        # Ingredients people added aren't the file's.
        Ingredient.objects.filter(status=IngredientStatus.CATALOGUE).exclude(
            pk__in=[row.pk for row in names.ingredients.values()]
        ).delete()
    return LoadedCatalogue(recipes=len(recipes), ingredients=len(names.ingredients), equipment=len(names.equipment))


def add_ingredient(name: str) -> tuple[Ingredient, bool]:
    """The ingredient with this name or synonym, ignoring case and accents, or a new one awaiting review under the
    name as given. True when it's new."""
    found = Ingredient.objects.called(name)
    if found is not None:
        return found, False
    try:
        with transaction.atomic():
            added = Ingredient.objects.create(
                name=name, slug=Ingredient.objects.unique_slug_for(name), status=IngredientStatus.AWAITING_REVIEW
            )
    except IntegrityError:
        # Someone else added the same name between the lookup and the insert.
        found = Ingredient.objects.called(name)
        if found is None:
            raise
        return found, False
    return added, True


def add_recipe(
    author: User,
    details: Record,
    cuisines: list[Cuisine],
    courses: list[Course],
    equipment: list[Equipment],
    ingredients: IngredientList,
    steps: list[str],
) -> Recipe:
    """Saves a private recipe in the author's household. Raises ValidationError when a pair is half given
    (servings or a yield, extra time and its label)."""
    with transaction.atomic():
        recipe = Recipe(
            household_id=author.household_id,
            created_by=author,
            slug=Recipe.objects.private_slug_for(details['title']),
            **details,
        )
        recipe.full_clean()
        recipe.save()
        recipe.cuisines.set(cuisines)
        recipe.courses.set(courses)
        recipe.equipment.set(equipment)
        _set_ingredients(recipe, ingredients)
        _set_steps(recipe, steps)
    return recipe


def copy_recipe(original: Recipe, copier: User) -> Recipe:
    """Makes a private Copy of the recipe in the copier's household, written by them and linked to the original, with
    the original's title, details, ingredients, method and photo."""
    with transaction.atomic():
        [copy] = Recipe.objects.filter(pk=original.pk).copy_into(copier.household_id, copier=copier)
    return copy


def edit_recipe(
    recipe: Recipe,
    details: Record,
    cuisines: list[Cuisine] | None,
    courses: list[Course] | None,
    equipment: list[Equipment] | None,
    ingredients: IngredientList | None,
    steps: list[str] | None,
) -> Recipe:
    """Changes the details given and keeps the recipe's address. None leaves the cuisines, courses, equipment,
    ingredients or steps as they are. A photo replaced or removed is deleted from the store once saved, unless another
    recipe uses it. Raises ValidationError when a pair is half given, as add_recipe does, or when a public recipe
    would be left missing something publishing_gaps() names."""
    replaced = recipe.photo_url
    with transaction.atomic():
        for name, value in details.items():
            setattr(recipe, name, value)
        # A new photo, or none, takes the old one's credit with it.
        if recipe.photo_url != replaced:
            recipe.photo_author, recipe.photo_licence, recipe.photo_source_url = '', '', ''
        recipe.full_clean()
        recipe.save()
        if cuisines is not None:
            recipe.cuisines.set(cuisines)
        if courses is not None:
            recipe.courses.set(courses)
        if equipment is not None:
            recipe.equipment.set(equipment)
        if ingredients is not None:
            _set_ingredients(recipe, ingredients)
        if steps is not None:
            _set_steps(recipe, steps)
        # Checked once everything is set, so raising rolls the whole edit back.
        gaps = publishing_gaps(recipe) if recipe.visibility == Visibility.PUBLIC else []
        if gaps:
            needs = _together(gaps)
            refusal = f"A public recipe needs {needs}, so these changes can't be saved. Make it private first."
            raise ValidationError({NON_FIELD_ERRORS: [refusal]})
        if recipe.photo_url != replaced:
            transaction.on_commit(partial(_delete_photo_unless_used, replaced))
    return recipe


def publishing_gaps(recipe: Recipe) -> list[str]:
    """What a recipe needs before it can be public, in the order the recipe page's "What's missing" lists them.
    An ingredient awaiting review isn't one: it only holds back the diet tags."""
    # Asked of the database, not a prefetch, so an edit's new lines and steps count.
    missing = [
        ('ingredients', not IngredientLine.objects.filter(recipe=recipe).exists()),
        ('a method', not Step.objects.filter(recipe=recipe).exists()),
        ('a prep time', recipe.prep_minutes is None),
        ('a cook time', recipe.cook_minutes is None),
        ('servings or a yield', recipe.servings is None and recipe.yield_amount is None),
    ]
    return [gap for gap, is_missing in missing if is_missing]


HELD_FOR_REVIEW = 'You can change this once staff have reviewed the report.'
REMOVED_BY_STAFF = 'Staff removed this recipe from public view after a report, so it stays private.'


# An account's recipes made public in one day, past which each one more waits for staff to approve it.
PUBLIC_A_DAY = 3


def waits_for_review(recipe: Recipe) -> bool:
    """Whether making the recipe public now would leave it waiting for review: its author has made PUBLIC_A_DAY
    others public today, counting those waiting for review. One made public earlier today keeps its place in the day,
    counting only those made public before it."""
    # Today in TIME_ZONE (London), so a day runs from midnight there.
    today = timezone.localdate()
    others = Recipe.objects.filter(created_by_id=recipe.created_by_id, published_at__date=today).exclude(pk=recipe.pk)
    if recipe.published_at is not None and timezone.localdate(recipe.published_at) == today:
        others = others.filter(published_at__lt=recipe.published_at)
    return recipe.created_by_id is not None and others.count() >= PUBLIC_A_DAY


def set_visibility(recipe: Recipe, visibility: Visibility) -> Recipe:
    """Makes the recipe public or private. Made public once its author has made PUBLIC_A_DAY others public today,
    it waits for review instead: it stays private until staff approve it, and making it private withdraws it. Raises
    ValidationError({'visibility': [...]}) when it's made public while publishing_gaps() names something or staff have
    removed it, or made private while a report hides it."""
    if recipe.moderation == Moderation.HELD:
        if visibility == Visibility.PRIVATE:
            # An update, not a save, so withdrawing it as staff approve it can't undo their approval.
            Recipe.objects.filter(pk=recipe.pk, moderation=Moderation.HELD).update(moderation=Moderation.UNREPORTED)
            recipe.refresh_from_db(fields=['visibility', 'moderation'])
        return recipe
    if recipe.visibility == visibility:
        return recipe
    # Going private would take the recipe out of review, and public again would bring it back unreviewed.
    if recipe.moderation == Moderation.HIDDEN:
        raise ValidationError({'visibility': [HELD_FOR_REVIEW]})
    if recipe.moderation == Moderation.REMOVED:
        raise ValidationError({'visibility': [REMOVED_BY_STAFF]})
    if visibility == Visibility.PUBLIC:
        gaps = publishing_gaps(recipe)
        if gaps:
            raise ValidationError({'visibility': [f'Add {_together(gaps)} before making it public.']})
    with transaction.atomic():
        if visibility == Visibility.PUBLIC:
            _publish(recipe)
        else:
            recipe.visibility = visibility
            recipe.save(update_fields=['visibility'])
    return recipe


def _publish(recipe: Recipe) -> None:
    # The author is locked, so two of their recipes made public at once can't both be counted as the last of the day.
    User.objects.select_for_update().filter(pk=recipe.created_by_id).first()
    held = waits_for_review(recipe)
    # Counted once a day, however often it's made private and public again.
    if recipe.published_at is None or timezone.localdate(recipe.published_at) != timezone.localdate():
        recipe.published_at = timezone.now()
    if held:
        recipe.moderation = Moderation.HELD
    else:
        recipe.visibility = Visibility.PUBLIC
    recipe.save(update_fields=['visibility', 'moderation', 'published_at'])
    # A public recipe is open to anyone, so its link stops, and making it private again doesn't bring it back. One
    # waiting for review will be public, so its link stops too.
    ShareLink.objects.filter(recipe=recipe).delete()


def approve_recipe(recipe: Recipe) -> bool:
    """Makes a recipe waiting for review public, as its author asked. False, changing nothing, once it's no longer
    waiting: its author withdrew it, or staff approved it already. Raises ValidationError when it now lacks something
    publishing_gaps() names, as its household may edit it while it waits."""
    with transaction.atomic():
        # Locked, so the author withdrawing it meanwhile either comes first or finds it public.
        locked = Recipe.objects.select_for_update().get(pk=recipe.pk)
        if locked.moderation != Moderation.HELD:
            return False
        gaps = publishing_gaps(locked)
        if gaps:
            raise ValidationError({NON_FIELD_ERRORS: [f'It needs {_together(gaps)} before it can be public.']})
        locked.visibility = Visibility.PUBLIC
        locked.moderation = Moderation.UNREPORTED
        locked.save(update_fields=['visibility', 'moderation'])
        ShareLink.objects.filter(recipe=locked).delete()
    return True


ALREADY_REPORTED = "You've reported this recipe already."


def report_recipe(recipe: Recipe, reporter: User, reason: ReportReason, note: str) -> bool:
    """Records the reporter's report of the recipe for staff, and hides the recipe from everyone but its author unless
    staff have restored it before. True when the recipe is hidden. Raises ValidationError when the reporter has
    reported it already."""
    try:
        with transaction.atomic():
            Report.objects.create(recipe=recipe, reporter=reporter, reason=reason, note=note)
    except IntegrityError as error:
        raise ValidationError({NON_FIELD_ERRORS: [ALREADY_REPORTED]}) from error
    # An update, not a save, so a report racing staff's restore can't hide the recipe again.
    Recipe.objects.filter(pk=recipe.pk, moderation=Moderation.UNREPORTED).update(moderation=Moderation.HIDDEN)
    return Recipe.objects.filter(pk=recipe.pk, moderation=Moderation.HIDDEN).exists()


def offers_report(recipe: Recipe, viewer: User | AnonymousUser) -> bool:
    """Whether the recipe's page offers Report recipe: on a household's public recipe, to anyone outside that
    household, signed in or not, as signing in comes first."""
    if recipe.visibility != Visibility.PUBLIC or recipe.household_id is None:
        return False
    return not viewer.is_authenticated or viewer.household_id != recipe.household_id


def has_reported(recipe: Recipe, viewer: User | AnonymousUser) -> bool:
    return viewer.is_authenticated and Report.objects.filter(recipe=recipe, reporter=viewer).exists()


def restore_recipe(recipe: Recipe) -> Recipe:
    """Shows the recipe to everyone who could see it before it was reported. Later reports reach staff without hiding
    it."""
    recipe.moderation = Moderation.RESTORED
    recipe.save(update_fields=['moderation'])
    return recipe


def remove_recipe(recipe: Recipe) -> Recipe:
    """Makes the recipe private for good: its household keeps it, but it can't be made public again."""
    recipe.visibility = Visibility.PRIVATE
    recipe.moderation = Moderation.REMOVED
    recipe.save(update_fields=['visibility', 'moderation'])
    # Its author may have shared it while a report of it, once restored, awaited review.
    turn_off_share_link(recipe)
    return recipe


StaffDecision = Literal[Moderation.RESTORED, Moderation.REMOVED]


def review_reports(recipe: Recipe, decision: StaffDecision) -> bool:
    """Staff's decision on the recipe's reports awaiting review: Moderation.RESTORED restores it and
    Moderation.REMOVED removes it. Marks those reports reviewed and, once that's saved, emails the author the outcome
    and the reasons. False, changing nothing, when no report awaits review."""
    with transaction.atomic():
        # Locked, so two staff deciding at once can't both act on the same reports.
        locked = Recipe.objects.select_for_update(of=('self',)).select_related('created_by').get(pk=recipe.pk)
        waiting = list(Report.objects.filter(recipe=locked, reviewed_at__isnull=True))
        if not waiting:
            return False
        Report.objects.filter(pk__in=[report.pk for report in waiting]).update(reviewed_at=timezone.now())
        decided = restore_recipe(locked) if decision == Moderation.RESTORED else remove_recipe(locked)
        reasons = [reason.label for reason in ReportReason if reason in {report.reason for report in waiting}]
        # An author who has deleted their account has no one to tell.
        if decided.created_by is not None:
            transaction.on_commit(partial(tell_author_of_review, decided, reasons))
    return True


def tell_author_of_review(recipe: Recipe, reasons: list[str]) -> None:
    """Emails the recipe's author whether staff restored or removed it, and what it was reported as. Never who
    reported it, or their notes."""
    author = recipe.created_by
    context = {'name': author.name, 'title': recipe.title, 'reasons': _together([reason.lower() for reason in reasons])}
    template = f'recipes/email/recipe_{recipe.moderation}'
    # As allauth does, so a recipe's title can't break the header.
    subject = ' '.join(render_to_string(f'{template}_subject.txt', context).splitlines()).strip()
    message = render_to_string(f'{template}_message.txt', context)
    try:
        send_mail(subject, message, None, [author.email])
    except smtplib.SMTPException, OSError:
        # The exception carries the address, so it stays out of the log; the decision stands either way.
        logger.error("Couldn't send the report review email")


def turn_on_share_link(recipe: Recipe) -> ShareLink:
    """Gives the private recipe a share link, or the one it has. Raises ValidationError({'share_link': [...]}) for a
    public recipe, which anyone can open already, one waiting for review, which will be public, or one staff removed."""
    if recipe.visibility != Visibility.PRIVATE:
        raise ValidationError({'share_link': ['A public recipe is open to anyone already, so it has no share link.']})
    if recipe.moderation == Moderation.HELD:
        raise ValidationError(
            {'share_link': ['This recipe will be public once staff approve it, so it has no share link.']}
        )
    if recipe.moderation == Moderation.REMOVED:
        raise ValidationError(
            {'share_link': ['Staff removed this recipe from public view after a report, so it has no share link.']}
        )
    link, _ = ShareLink.objects.get_or_create(recipe=recipe)
    return link


def turn_off_share_link(recipe: Recipe) -> None:
    """Deletes the recipe's share link, if it has one, so its address shows "Recipe not found"."""
    ShareLink.objects.filter(recipe=recipe).delete()


def shared_recipe(token: str) -> Recipe | None:
    """The private recipe a live share link opens, with its ingredients and method, or None for a link that's off or
    never was."""
    return (
        Recipe.objects.private()
        .filter(share_link__token=token)
        .prefetch_related('cuisines', 'courses', 'equipment')
        .with_ingredients_and_method()
        .first()
    )


def _together(parts: list[str]) -> str:
    """The parts as a sentence lists them: "a, b and c", with no comma before the "and"."""
    if len(parts) == 1:
        return parts[0]
    return f'{", ".join(parts[:-1])} and {parts[-1]}'


def save_count(recipe: Recipe, excluding: User) -> int:
    """How many accounts other than `excluding` have saved the recipe, and will find it gone once it's deleted."""
    return sum(count for _, count in counting_saves.send(sender=Recipe, recipe=recipe, excluding=excluding))


def delete_recipe(recipe: Recipe) -> None:
    """Deletes the recipe with its ingredient lines, groups, steps and uploaded photo, unless another recipe uses the
    photo. An added ingredient only it used stays, awaiting review."""
    with transaction.atomic():
        recipe.delete()
        transaction.on_commit(partial(_delete_photo_unless_used, recipe.photo_url))


def _delete_photo_unless_used(url: str) -> None:
    # A moving member's copies keep the original's address, and a recipe may be given any uploaded photo's address.
    if not Recipe.objects.filter(photo_url=url).exists():
        delete_photo(url)


def _set_ingredients(recipe: Recipe, ingredients: IngredientList) -> None:
    """Replaces the recipe's lines and groups in four queries, however many there are. The serializer has checked
    each line, so the database's constraints are only a backstop."""
    IngredientLine.objects.filter(recipe=recipe).delete()
    IngredientGroup.objects.filter(recipe=recipe).delete()
    groups = IngredientGroup.objects.bulk_create(
        [
            IngredientGroup(recipe=recipe, name=group['name'], position=position)
            for position, group in enumerate(ingredients.groups)
        ]
    )
    placed = [
        (None, ingredients.lines),
        *zip(groups, (group['lines'] for group in ingredients.groups), strict=True),
    ]
    IngredientLine.objects.bulk_create(
        [
            IngredientLine(recipe=recipe, group=group, position=position, **line)
            for group, lines in placed
            for position, line in enumerate(lines)
        ]
    )


def _set_steps(recipe: Recipe, steps: list[str]) -> None:
    """Replaces the recipe's steps in two queries, numbered in the order given."""
    Step.objects.filter(recipe=recipe).delete()
    Step.objects.bulk_create([Step(recipe=recipe, position=position, text=text) for position, text in enumerate(steps)])


def add_described_recipes(author: User, records: list[Record]) -> list[Recipe]:
    """Saves private recipes in the author's household, each from a record shaped as a recipe in the catalogue file
    without its slug. Raises CatalogueError naming the recipe and what the database can't hold in it."""
    names = _Names(
        cuisines=_by_name(Cuisine.objects.all()),
        courses=_by_name(Course.objects.all()),
        equipment=_by_name(Equipment.objects.all()),
        ingredients=_by_name(Ingredient.objects.all()),
    )
    with transaction.atomic():
        return [_add_described_recipe(author, record, names) for record in records]


def _add_described_recipe(author: User, record: Record, names: _Names) -> Recipe:
    references = {'cuisines', 'courses', 'equipment', 'ingredient_lines', 'ingredient_groups', 'steps'}
    # A missing title is left to full_clean, so it's refused with a message rather than a KeyError.
    title = record.get('title', '')
    where = f'Recipe "{title}"'
    recipe = Recipe(
        household_id=author.household_id,
        created_by=author,
        slug=Recipe.objects.private_slug_for(title),
        **_plain_fields(Recipe, record, where, references),
    )
    _save(recipe, where)
    recipe.cuisines.set(_look_up(names.cuisines, record.get('cuisines', []), where, 'cuisine'))
    recipe.courses.set(_look_up(names.courses, record.get('courses', []), where, 'course'))
    recipe.equipment.set(_look_up(names.equipment, record.get('equipment', []), where, 'equipment'))
    groups = [
        IngredientGroup(
            recipe=recipe, position=position, **_plain_fields(IngredientGroup, group, f'{where}, group', {'lines'})
        )
        for position, group in enumerate(_objects(record.get('ingredient_groups', []), where, 'ingredient group'))
    ]
    for group in groups:
        _save(group, f'{where}, group')
    for line in _lines(recipe, record, groups, names, where):
        _save(line, f'{where}, ingredient line')
    for position, text in enumerate(record.get('steps', [])):
        _save(Step(recipe=recipe, position=position, text=text), f'{where}, step')
    return recipe


def _read(path: Path) -> Record:
    try:
        with path.open(encoding='utf-8') as file:
            catalogue = json.load(file, parse_float=Decimal)
    except (OSError, json.JSONDecodeError) as error:
        raise CatalogueError(f'Could not read {path}: {error}') from error
    keys = {'ingredients', 'equipment', 'recipes'}
    if not isinstance(catalogue, dict) or catalogue.keys() != keys:
        raise CatalogueError(f'{path} must hold exactly these lists: {", ".join(sorted(keys))}')
    slugs = [record.get('slug', '') for record in catalogue['recipes']]
    if '' in slugs:
        raise CatalogueError('Every recipe needs a slug: it keeps the recipe the same recipe from one load to the next')
    _refuse_repeats(slugs, 'Recipe slugs')
    if 'new' in slugs:
        raise CatalogueError(
            'The recipe slug "new" is the address of the form for adding a recipe; give the recipe another slug'
        )
    return catalogue


def _refuse_repeats(values: Iterable[str], what: str) -> None:
    repeated = sorted(value for value, count in Counter(values).items() if count > 1)
    if repeated:
        raise CatalogueError(f'{what} must be unique, but these repeat: {", ".join(repeated)}')


def _by_name[M: Cuisine | Course | Equipment | Ingredient](rows: Iterable[M]) -> dict[str, M]:
    return {row.name: row for row in rows}


def _load_named[M: Equipment | Ingredient](
    model: type[M], records: list[Record], kind: str, references: set[str]
) -> dict[str, M]:
    unshaped = [record for record in records if not isinstance(record, dict)]
    if unshaped:
        raise CatalogueError(f'Each {kind.lower()} must be an object with its name, but these are not: {unshaped}')
    names = [record.get('name', '') for record in records]
    # The slug is the row's identity, so two names that slugify alike would be one row.
    _refuse_repeats((slugify(name) for name in names), f'{kind} slugs')
    existing = dict(model.objects.values_list('slug', 'pk'))
    placed: list[tuple[M, str]] = []
    for name, record in zip(names, records, strict=True):
        where = f'{kind} "{name}"'
        # Made afresh, so a field the file leaves out goes back to its default.
        row = model(slug=slugify(name), **_plain_fields(model, record, where, references))
        _take_place(row, existing.get(row.slug))
        placed.append((row, where))
    _write(model, placed)
    return {name: row for name, (row, _) in zip(names, placed, strict=True)}


def _load_synonyms(ingredients: dict[str, Ingredient], records: list[Record]) -> None:
    wanted: list[tuple[int, str, str]] = []
    for record in records:
        where = f'Ingredient "{record["name"]}"'
        synonyms = record.get('synonyms', [])
        if not isinstance(synonyms, list) or not all(isinstance(synonym, str) for synonym in synonyms):
            raise CatalogueError(f'{where} must give its synonyms as a list of names')
        wanted += [(ingredients[record['name']].pk, synonym, where) for synonym in synonyms]
    keep = {(pk, synonym) for pk, synonym, _ in wanted}
    # Every stale synonym goes before any is added, so a name can move from one ingredient to another.
    stale = [row.pk for row in IngredientSynonym.objects.all() if (row.ingredient_id, row.name) not in keep]
    IngredientSynonym.objects.filter(pk__in=stale).delete()
    existing = set(IngredientSynonym.objects.values_list('ingredient_id', 'name'))
    added = [
        (IngredientSynonym(ingredient_id=pk, name=synonym), where)
        for pk, synonym, where in wanted
        if (pk, synonym) not in existing
    ]
    _write(IngredientSynonym, added)


def _load_recipes(records: list[Record], names: _Names) -> list[Recipe]:
    references = {'slug', 'cuisines', 'courses', 'equipment', 'ingredient_lines', 'ingredient_groups', 'steps'}
    existing = dict(Recipe.objects.catalogue().values_list('slug', 'pk'))
    loaded: list[tuple[Recipe, Record, str]] = []
    for record in records:
        where = f'Recipe {record["slug"]}'
        recipe = Recipe(
            slug=record['slug'], **{**_plain_fields(Recipe, record, where, references), 'visibility': Visibility.PUBLIC}
        )
        _take_place(recipe, existing.get(recipe.slug))
        loaded.append((recipe, record, where))
    _write(Recipe, [(recipe, where) for recipe, _, where in loaded])

    for field_name, rows, kind in [
        ('cuisines', names.cuisines, 'cuisine'),
        ('courses', names.courses, 'course'),
        ('equipment', names.equipment, 'equipment'),
    ]:
        links = [(recipe, _look_up(rows, record.get(field_name, []), where, kind)) for recipe, record, where in loaded]
        _link(field_name, links)

    groups = {
        recipe.pk: [
            IngredientGroup(
                recipe=recipe, position=position, **_plain_fields(IngredientGroup, group, f'{where}, group', {'lines'})
            )
            for position, group in enumerate(_objects(record.get('ingredient_groups', []), where, 'ingredient group'))
        ]
        for recipe, record, where in loaded
    }
    _replace(IngredientGroup, [(recipe, groups[recipe.pk], where) for recipe, _, where in loaded])
    lines = [
        (recipe, _lines(recipe, record, groups[recipe.pk], names, where), where) for recipe, record, where in loaded
    ]
    _replace(IngredientLine, lines)
    steps = [
        (
            recipe,
            [
                Step(recipe=recipe, position=position, text=text)
                for position, text in enumerate(record.get('steps', []))
            ],
            where,
        )
        for recipe, record, where in loaded
    ]
    _replace(Step, steps)
    return [recipe for recipe, _, _ in loaded]


def _lines(
    recipe: Recipe, record: Record, groups: list[IngredientGroup], names: _Names, where: str
) -> list[IngredientLine]:
    placed = [
        (None, record.get('ingredient_lines', [])),
        *zip(groups, (g.get('lines', []) for g in record.get('ingredient_groups', [])), strict=True),
    ]
    return [
        IngredientLine(
            recipe=recipe,
            group=group,
            position=position,
            ingredient=_look_up(names.ingredients, [line.get('ingredient', '')], where, 'ingredient')[0],
            **_plain_fields(IngredientLine, line, f'{where}, ingredient line', {'ingredient'}),
        )
        for group, group_lines in placed
        for position, line in enumerate(_objects(group_lines, where, 'ingredient line'))
    ]


def _objects(records: list[Any], where: str, kind: str) -> list[Record]:
    unshaped = [str(record) for record in records if not isinstance(record, dict)]
    if unshaped:
        raise CatalogueError(f'{where}: each {kind} must be an object, but these are not: {", ".join(unshaped)}')
    return records


def _plain_fields(model: type[models.Model], record: Record, where: str, references: set[str]) -> Record:
    # Position comes from the order in the file, and ids, slugs and status are the loader's to give.
    allowed = {
        field.name
        for field in model._meta.concrete_fields
        if field.editable
        and not field.primary_key
        and not field.is_relation
        and field.name not in {'position', 'slug', 'status'}
    }
    unknown = record.keys() - allowed - references
    if unknown:
        raise CatalogueError(f'{where} has fields the catalogue does not know: {", ".join(sorted(unknown))}')
    return {name: value for name, value in record.items() if name in allowed}


def _look_up[M: models.Model](rows: dict[str, M], names: list[str], where: str, kind: str) -> list[M]:
    missing = [f'"{name}"' for name in names if name not in rows]
    if missing:
        raise CatalogueError(f'{where} names no known {kind}: {", ".join(missing)}')
    return [rows[name] for name in names]


def _link(field_name: str, links: list[tuple[Recipe, list[Any]]]) -> None:
    """Makes each catalogue recipe's rows through a many-to-many field the given ones."""
    field = Recipe._meta.get_field(field_name)
    assert isinstance(field, models.ManyToManyField)
    through = field.remote_field.through
    source, target = f'{field.m2m_field_name()}_id', f'{field.m2m_reverse_field_name()}_id'
    wanted = {(recipe.pk, row.pk) for recipe, rows in links for row in rows}
    catalogues = through.objects.filter(**{f'{field.m2m_field_name()}__household__isnull': True})
    existing = {(source_id, target_id): pk for pk, source_id, target_id in catalogues.values_list('pk', source, target)}
    through.objects.filter(pk__in=[pk for pair, pk in existing.items() if pair not in wanted]).delete()
    through.objects.bulk_create([through(**{source: a, target: b}) for a, b in sorted(wanted - existing.keys())])


def _replace[M: IngredientGroup | IngredientLine | Step](
    model: type[M], children: list[tuple[Recipe, list[M], str]]
) -> None:
    # Each row reuses the id of the existing row in its place, so loading an unchanged file keeps every id.
    ids: dict[int, list[int]] = defaultdict(list)
    for recipe_id, pk in model.objects.order_by('id').values_list('recipe_id', 'pk'):
        ids[recipe_id].append(pk)
    for recipe, rows, _ in children:
        for row, row_id in zip(rows, ids[recipe.pk], strict=False):
            _take_place(row, row_id)
    _write(model, [(row, where) for _, rows, where in children for row in rows])
    model.objects.filter(pk__in=[pk for recipe, rows, _ in children for pk in ids[recipe.pk][len(rows) :]]).delete()


def _take_place(row: models.Model, pk: int | None) -> None:
    if pk is not None:
        row.pk = pk
        # Saved as the existing row, so the uniqueness checks don't count it against itself.
        row._state.adding = False


def _write[M: models.Model](model: type[M], placed: list[tuple[M, str]]) -> None:
    """Saves the rows the file adds or changes in a few queries, however many there are."""
    # One query a row timed deploys out, with the build in Washington and the database in London.
    for row, where in placed:
        _clean(row, where, exclude=_relations(model), validate_unique=False, validate_constraints=False)
    fields = [field for field in model._meta.concrete_fields if not field.primary_key]
    existing = model.objects.in_bulk([row.pk for row, _ in placed if row.pk is not None])
    added = [row for row, _ in placed if row.pk is None]
    changed = [
        row for row, _ in placed if row.pk is not None and _values(row, fields) != _values(existing[row.pk], fields)
    ]
    try:
        with transaction.atomic():
            model.objects.bulk_create(added)
            model.objects.bulk_update(changed, [field.name for field in fields])
    except IntegrityError:
        # The database refused a row: saving them one at a time, checked in full, says which and why.
        for row in added:
            row.pk = None
            row._state.adding = True
        for row, where in placed:
            _save(row, where)
        raise


def _relations(model: type[models.Model]) -> list[str]:
    return [field.name for field in model._meta.concrete_fields if field.is_relation]


def _values(row: models.Model, fields: list[models.Field[Any, Any]]) -> list[Any]:
    return [getattr(row, field.attname) for field in fields]


def _save(row: models.Model, where: str) -> None:
    _clean(row, where)
    row.save()


def _clean(row: models.Model, where: str, **checks: Any) -> None:
    try:
        row.full_clean(**checks)
    except ValidationError as error:
        raise CatalogueError(f'{where}: {" ".join(error.messages)}') from error


@dataclass(frozen=True)
class DietTagConflict:
    """An optional ingredient that would take diet tags away from its recipe, if it were used."""

    ingredient: Ingredient
    diet_tags: list[DietTag]


def _allows(ingredient: Ingredient, tag: DietTag) -> bool:
    return not any(getattr(ingredient, flag) for flag in RULED_OUT_BY[tag])


def diet_tags(lines: Iterable[IngredientLine]) -> list[DietTag]:
    """The diet tags every required line allows. Optional lines never take one away."""
    lines = list(lines)
    # An ingredient someone added says nothing of what it contains until staff review it.
    if any(line.ingredient.awaiting_review for line in lines):
        return []
    required = [line.ingredient for line in lines if not line.optional]
    # A recipe whose ingredients aren't filled in yet would otherwise claim every diet.
    if not required:
        return []
    return [tag for tag in DietTag if all(_allows(ingredient, tag) for ingredient in required)]


def diet_tag_conflicts(lines: Iterable[IngredientLine]) -> list[DietTagConflict]:
    """Each optional ingredient that the recipe's diet tags don't allow, with the tags it would take away."""
    lines = list(lines)
    tags = diet_tags(lines)
    # Keyed by id, so an ingredient on two optional lines is named once.
    optional = {line.ingredient.pk: line.ingredient for line in lines if line.optional}
    conflicts = [
        DietTagConflict(ingredient, [tag for tag in tags if not _allows(ingredient, tag)])
        for ingredient in optional.values()
    ]
    return [conflict for conflict in conflicts if conflict.diet_tags]
