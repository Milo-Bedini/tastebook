import json
from collections import Counter, defaultdict
from collections.abc import Iterable
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path
from typing import Any

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import IntegrityError, models, transaction
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
    Recipe,
    Step,
)

CATALOGUE_PATH = settings.BASE_DIR / 'recipes' / 'catalogue.json'

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
    author: User, details: Record, cuisines: list[Cuisine], courses: list[Course], ingredients: IngredientList
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
        _set_ingredients(recipe, ingredients)
    return recipe


def edit_recipe(
    recipe: Recipe,
    details: Record,
    cuisines: list[Cuisine] | None,
    courses: list[Course] | None,
    ingredients: IngredientList | None,
) -> Recipe:
    """Changes the details given and keeps the recipe's address. None leaves the cuisines, courses or ingredients
    as they are. Raises ValidationError when a pair is half given, as add_recipe does."""
    with transaction.atomic():
        for name, value in details.items():
            setattr(recipe, name, value)
        recipe.full_clean()
        recipe.save()
        if cuisines is not None:
            recipe.cuisines.set(cuisines)
        if courses is not None:
            recipe.courses.set(courses)
        if ingredients is not None:
            _set_ingredients(recipe, ingredients)
    return recipe


def delete_recipe(recipe: Recipe) -> None:
    """Deletes the recipe with its ingredient lines, groups and steps. An added ingredient only it used stays,
    awaiting review."""
    recipe.delete()


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
        recipe = Recipe(slug=record['slug'], **_plain_fields(Recipe, record, where, references))
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
