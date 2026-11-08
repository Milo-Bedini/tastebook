from dataclasses import dataclass
from datetime import datetime, timedelta
from itertools import chain, count

from django.core import signing
from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Count, F, OuterRef, Prefetch, Q, QuerySet, Subquery, Value, Window
from django.db.models.functions import Lower, RowNumber
from django.utils import timezone
from django.utils.text import slugify

from households.models import Household, User
from recipe_collections.models import LIST_NAME_MAX_LENGTH, RecipeList, SavedRecipe, Scope
from recipes.models import Recipe

FAVOURITES_SLUG = 'favourites'
FAVOURITES_NAME = 'Favourites'

# The fan on the Lists page shows a list's newest few available recipes.
COVER_COUNT = 3

# Long enough for any toast's Undo; a token is only good for the list it came from.
UNDO_LIFETIME = timedelta(hours=1)
UNDO_SALT = 'recipe_collections.undo'
UNDO_REFUSED = "That can't be undone any more."


# A list's name is taken among the owner's lists, or the household's; Favourites is every account's own.
NAME_MISSING = 'Give the list a name, like Weeknight dinners.'
FAVOURITES_TAKEN = 'Favourites is already yours. Try another name.'


@dataclass(frozen=True)
class ListSummary:
    slug: str
    name: str
    scope: Scope
    recipe_count: int
    covers: list[Recipe]


@dataclass(frozen=True)
class Lists:
    household_name: str | None
    household_members: int
    lists: list[ListSummary]


@dataclass(frozen=True)
class ListPlace:
    slug: str
    name: str
    scope: Scope
    recipe_count: int
    # The save that holds the recipe in this list, or None when the list doesn't hold it.
    saved_id: int | None


@dataclass(frozen=True)
class RecipeLists:
    household_name: str | None
    lists: list[ListPlace]


@dataclass(frozen=True)
class SavedList:
    slug: str
    name: str
    scope: Scope
    household_name: str | None
    saved_recipes: list[SavedRecipe]


def _visible(account: User) -> Prefetch:
    # A recipe the account can't see is left as None, so the list shows the save as unavailable.
    recipes = Recipe.objects.visible_to(account).select_related('created_by').prefetch_related('cuisines')
    return Prefetch('recipe', queryset=recipes.with_diet_tags())


def _lists_seen_by(account: User) -> QuerySet[RecipeList]:
    """The lists an account sees and changes: its own, and every list of its household's."""
    own = Q(owner=account)
    if account.household_id is None:
        return RecipeList.objects.filter(own)
    return RecipeList.objects.filter(own | Q(household_id=account.household_id))


def _owned(account: User, scope: Scope) -> QuerySet[RecipeList]:
    """The account's own lists, or its household's: the lists a new one's name and address must differ from."""
    if scope == Scope.PERSONAL:
        return RecipeList.objects.filter(owner=account)
    if account.household_id is None:
        return RecipeList.objects.none()
    return RecipeList.objects.filter(household_id=account.household_id)


def _found(account: User, scope: Scope, slug: str) -> RecipeList | None:
    return _owned(account, scope).select_related('household').filter(slug=slug).first()


def _covers(account: User, lists: list[RecipeList]) -> dict[int, list[Recipe]]:
    """Each list's newest few recipes the account can see, in one query however many lists there are."""
    place = Window(RowNumber(), partition_by=F('recipe_list'), order_by=[F('saved_at').desc(), F('pk').desc()])
    newest = (
        SavedRecipe.objects.filter(recipe_list__in=lists, recipe__in=Recipe.objects.visible_to(account))
        .annotate(place=place)
        .filter(place__lte=COVER_COUNT)
        .order_by('recipe_list', 'place')
        .select_related('recipe')
    )
    covers: dict[int, list[Recipe]] = {}
    for saved in newest:
        covers.setdefault(saved.recipe_list_id, []).append(saved.recipe)
    return covers


def _summary(recipe_list: RecipeList, recipe_count: int, covers: list[Recipe]) -> ListSummary:
    return ListSummary(
        slug=recipe_list.slug,
        name=recipe_list.name,
        scope=recipe_list.scope,
        recipe_count=recipe_count,
        covers=covers,
    )


def _household_name(account: User) -> str | None:
    return account.household.name if account.household_id is not None else None


def _in_index_order(found: RecipeList) -> tuple[bool, bool, str, int]:
    # Favourites first, then the account's own lists by name, then its household's by name.
    return (found.household_id is not None, not found.favourites, found.name.casefold(), found.pk)


def lists_of(account: User) -> Lists:
    """Every list the account sees: Favourites first, even before anything is saved to it, then its own lists by name,
    then its household's by name."""
    lists = sorted(_lists_seen_by(account).annotate(recipe_count=Count('saved_recipes')), key=_in_index_order)
    covers = _covers(account, lists)
    summaries = [_summary(found, found.recipe_count, covers.get(found.pk, [])) for found in lists]
    if not any(found.favourites for found in lists):
        summaries.insert(0, ListSummary(FAVOURITES_SLUG, FAVOURITES_NAME, Scope.PERSONAL, 0, []))
    members = User.objects.filter(household_id=account.household_id).count() if account.household_id else 0
    return Lists(household_name=_household_name(account), household_members=members, lists=summaries)


def lists_holding(account: User, recipe: Recipe) -> RecipeLists:
    """Every list the account sees, in the Lists page's order and Favourites among them, each with the save that holds
    the recipe there, in one query however many lists there are."""
    holding = SavedRecipe.objects.filter(recipe_list=OuterRef('pk'), recipe=recipe).values('pk')[:1]
    lists = sorted(
        _lists_seen_by(account).annotate(recipe_count=Count('saved_recipes'), saved_id=Subquery(holding)),
        key=_in_index_order,
    )
    places = [ListPlace(found.slug, found.name, found.scope, found.recipe_count, found.saved_id) for found in lists]
    if not any(found.favourites for found in lists):
        places.insert(0, ListPlace(FAVOURITES_SLUG, FAVOURITES_NAME, Scope.PERSONAL, 0, None))
    return RecipeLists(household_name=_household_name(account), lists=places)


def _shown_list(account: User, recipe_list: RecipeList) -> SavedList:
    saves = recipe_list.saved_recipes.newest_first().prefetch_related(_visible(account))
    return SavedList(
        slug=recipe_list.slug,
        name=recipe_list.name,
        scope=recipe_list.scope,
        household_name=recipe_list.household.name if recipe_list.household is not None else None,
        saved_recipes=list(saves),
    )


def list_of(account: User, scope: Scope, slug: str) -> SavedList | None:
    """One of the account's lists, or its household's, with its saved recipes newest first; one the account can no
    longer see keeps its place with no recipe. None when it has no such list."""
    recipe_list = _found(account, scope, slug)
    if recipe_list is not None:
        return _shown_list(account, recipe_list)
    if scope == Scope.PERSONAL and slug == FAVOURITES_SLUG:
        return SavedList(FAVOURITES_SLUG, FAVOURITES_NAME, Scope.PERSONAL, None, [])
    return None


def _another_name(name: str) -> str:
    year = str(timezone.localdate().year)
    return f'{name} 2' if year in name else f'{name} {year}'


def _refuse_taken(account: User, scope: Scope, name: str, renaming: RecipeList | None = None) -> None:
    if name.casefold() == FAVOURITES_NAME.casefold():
        raise ValidationError({'name': [FAVOURITES_TAKEN]})
    others = _owned(account, scope).exclude(pk=renaming.pk if renaming is not None else None)
    same = others.alias(folded=Lower('name')).filter(folded=Lower(Value(name))).first()
    if same is None:
        return
    who = 'You already have' if scope == Scope.PERSONAL else f'{_household_name(account)} already have'
    raise ValidationError({'name': [f'{who} a list called {same.name}. Try another name, like {_another_name(name)}.']})


def _free_slug(account: User, scope: Scope, name: str, renaming: RecipeList | None = None) -> str:
    # A name with no letters or digits (say '!!!') slugifies to ''.
    base = (slugify(name) or 'list')[:LIST_NAME_MAX_LENGTH].strip('-')
    others = _owned(account, scope).exclude(pk=renaming.pk if renaming is not None else None)
    taken = set(others.filter(slug__startswith=base).values_list('slug', flat=True))
    # Favourites' address is every account's, made or not.
    if scope == Scope.PERSONAL:
        taken.add(FAVOURITES_SLUG)
    candidates = chain([base], (f'{base}-{n}' for n in count(2)))
    return next(candidate for candidate in candidates if candidate not in taken)


def _lock_owner(account: User, scope: Scope) -> None:
    # Two lists made or renamed at once with one name would otherwise both pass the check and one would fail to save.
    if scope == Scope.PERSONAL:
        User.objects.select_for_update().filter(pk=account.pk).exists()
    else:
        Household.objects.select_for_update().filter(pk=account.household_id).exists()


def make_list(account: User, name: str, scope: Scope) -> SavedList:
    """Makes an empty list, the account's own or its household's, at an address of its own made from its name. Raises
    ValidationError when the owner already has a list of that name, or it's Favourites, or the account has no
    household to make one for."""
    if scope == Scope.HOUSEHOLD and account.household_id is None:
        raise ValidationError({'scope': ['Only someone in a household can make a list for it.']})
    with transaction.atomic():
        _lock_owner(account, scope)
        _refuse_taken(account, scope, name)
        owner = {'owner': account} if scope == Scope.PERSONAL else {'household_id': account.household_id}
        recipe_list = RecipeList.objects.create(**owner, name=name, slug=_free_slug(account, scope, name))
    return _shown_list(account, recipe_list)


def rename_list(account: User, scope: Scope, slug: str, name: str) -> SavedList | None:
    """Renames one of the account's lists, or its household's, and moves its address to match. None when it has no
    such list, or it's Favourites. Raises ValidationError as make_list does."""
    with transaction.atomic():
        _lock_owner(account, scope)
        recipe_list = _found(account, scope, slug)
        if recipe_list is None or recipe_list.favourites:
            return None
        _refuse_taken(account, scope, name, renaming=recipe_list)
        recipe_list.name = name
        recipe_list.slug = _free_slug(account, scope, name, renaming=recipe_list)
        recipe_list.save(update_fields=['name', 'slug'])
    return _shown_list(account, recipe_list)


def delete_list(account: User, scope: Scope, slug: str) -> bool:
    """Deletes one of the account's lists, or its household's; its recipes stay. False when it has no such list, or
    it's Favourites."""
    deleted, _ = _owned(account, scope).filter(slug=slug, favourites=False).delete()
    return deleted > 0


def _shown(saved: SavedRecipe, account: User) -> SavedRecipe:
    return SavedRecipe.objects.prefetch_related(_visible(account)).get(pk=saved.pk)


def save_to_favourites(account: User, recipe: Recipe) -> tuple[SavedRecipe, bool]:
    """Saves a recipe the account can see to its Favourites, making Favourites if it's the first save. Saving it again
    changes nothing. True when it's newly saved."""
    with transaction.atomic():
        favourites, _ = RecipeList.objects.get_or_create(
            owner=account, favourites=True, defaults={'name': FAVOURITES_NAME, 'slug': FAVOURITES_SLUG}
        )
        saved, added = SavedRecipe.objects.get_or_create(
            recipe_list=favourites, recipe=recipe, defaults={'title': recipe.title}
        )
    return _shown(saved, account), added


def save_to_list(account: User, scope: Scope, slug: str, recipe: Recipe) -> tuple[SavedRecipe, bool]:
    """Saves a recipe the account can see to one of its lists, or its household's; saving it again changes nothing.
    True when it's newly saved. Raises RecipeList.DoesNotExist when it has no such list."""
    if scope == Scope.PERSONAL and slug == FAVOURITES_SLUG:
        return save_to_favourites(account, recipe)
    recipe_list = _found(account, scope, slug)
    if recipe_list is None:
        raise RecipeList.DoesNotExist
    saved, added = SavedRecipe.objects.get_or_create(
        recipe_list=recipe_list, recipe=recipe, defaults={'title': recipe.title}
    )
    return _shown(saved, account), added


def unsave(account: User, saved_id: int) -> str | None:
    """Takes a saved recipe out of one of the account's lists, or its household's, and gives a token that puts it back
    as it was; None when there's no such save in them."""
    saved = SavedRecipe.objects.filter(pk=saved_id, recipe_list__in=_lists_seen_by(account)).first()
    if saved is None:
        return None
    token = signing.dumps(
        {
            'id': saved.pk,
            'list': saved.recipe_list_id,
            'recipe': saved.recipe_id,
            'title': saved.title,
            'saved_at': saved.saved_at.isoformat(),
        },
        salt=UNDO_SALT,
    )
    saved.delete()
    return token


def undo_unsave(account: User, token: str) -> SavedRecipe:
    """Puts back a saved recipe `unsave` took out, in its old place. Raises ValidationError for a token that's
    expired or forged, or whose list the account no longer sees."""
    try:
        removed = signing.loads(token, salt=UNDO_SALT, max_age=UNDO_LIFETIME)
    except signing.BadSignature as error:
        raise ValidationError({'undo': [UNDO_REFUSED]}) from error
    recipe_list = _lists_seen_by(account).filter(pk=removed['list']).first()
    if recipe_list is None:
        raise ValidationError({'undo': [UNDO_REFUSED]})
    with transaction.atomic():
        # Put back already, or saved again since: either way it's in the list.
        same = Q(pk=removed['id']) | Q(recipe_id=removed['recipe'], recipe__isnull=False)
        found = SavedRecipe.objects.filter(same, recipe_list=recipe_list).first()
        if found is not None:
            return _shown(found, account)
        # Deleted since it was taken out, it comes back unavailable.
        recipe = Recipe.objects.filter(pk=removed['recipe']).first() if removed['recipe'] is not None else None
        saved = SavedRecipe.objects.create(
            pk=removed['id'],
            recipe_list=recipe_list,
            recipe=recipe,
            title=removed['title'],
            saved_at=datetime.fromisoformat(removed['saved_at']),
        )
    return _shown(saved, account)
