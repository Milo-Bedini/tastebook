from dataclasses import dataclass
from datetime import datetime, timedelta

from django.core import signing
from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Prefetch, Q

from households.models import User
from recipe_collections.models import RecipeList, SavedRecipe
from recipes.models import Recipe

FAVOURITES_SLUG = 'favourites'
FAVOURITES_NAME = 'Favourites'

# The fan on the Lists page shows a list's newest few available recipes.
COVER_COUNT = 3

# Long enough for any toast's Undo; a token is only good for the list it came from.
UNDO_LIFETIME = timedelta(hours=1)
UNDO_SALT = 'recipe_collections.undo'
UNDO_REFUSED = "That can't be undone any more."


@dataclass(frozen=True)
class ListSummary:
    slug: str
    name: str
    recipe_count: int
    covers: list[Recipe]


@dataclass(frozen=True)
class SavedList:
    slug: str
    name: str
    saved_recipes: list[SavedRecipe]


def _visible(account: User) -> Prefetch:
    # A recipe the account can't see is left as None, so the list shows the save as unavailable.
    recipes = Recipe.objects.visible_to(account).select_related('created_by').prefetch_related('cuisines')
    return Prefetch('recipe', queryset=recipes.with_diet_tags())


def lists_of(account: User) -> list[ListSummary]:
    """Every list the account has: Favourites, even before anything is saved to it."""
    saves = SavedRecipe.objects.in_favourites_of(account)
    covers = saves.filter(recipe__in=Recipe.objects.visible_to(account)).newest_first().select_related('recipe')
    return [
        ListSummary(
            slug=FAVOURITES_SLUG,
            name=FAVOURITES_NAME,
            recipe_count=saves.count(),
            covers=[saved.recipe for saved in covers[:COVER_COUNT] if saved.recipe is not None],
        )
    ]


def favourites_of(account: User) -> SavedList:
    """Favourites' saved recipes, newest first; one the account can no longer see keeps its place with no recipe."""
    saves = SavedRecipe.objects.in_favourites_of(account).newest_first().prefetch_related(_visible(account))
    return SavedList(slug=FAVOURITES_SLUG, name=FAVOURITES_NAME, saved_recipes=list(saves))


def _shown(saved: SavedRecipe, account: User) -> SavedRecipe:
    return SavedRecipe.objects.prefetch_related(_visible(account)).get(pk=saved.pk)


def save_to_favourites(account: User, recipe: Recipe) -> tuple[SavedRecipe, bool]:
    """Saves a recipe the account can see to its Favourites, making Favourites if it's the first save. Saving it again
    changes nothing. True when it's newly saved."""
    with transaction.atomic():
        favourites, _ = RecipeList.objects.get_or_create(owner=account, favourites=True)
        saved, added = SavedRecipe.objects.get_or_create(
            recipe_list=favourites, recipe=recipe, defaults={'title': recipe.title}
        )
    return _shown(saved, account), added


def unsave(account: User, saved_id: int) -> str | None:
    """Takes a saved recipe out of the account's list and gives a token that puts it back as it was; None when the
    account has no such save."""
    saved = SavedRecipe.objects.filter(pk=saved_id, recipe_list__owner=account).first()
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
    expired, forged or another account's."""
    try:
        removed = signing.loads(token, salt=UNDO_SALT, max_age=UNDO_LIFETIME)
    except signing.BadSignature as error:
        raise ValidationError({'undo': [UNDO_REFUSED]}) from error
    recipe_list = RecipeList.objects.filter(pk=removed['list'], owner=account).first()
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
