from dataclasses import dataclass
from typing import Any

from django.core.exceptions import ValidationError
from django.db import transaction

from households.models import UnitSystem, User
from households.services import TestMember, add_test_household, start_session
from recipe_collections.models import Scope
from recipe_collections.services import make_list, save_to_favourites, save_to_list
from recipes.models import Recipe, Visibility
from recipes.services import (
    CatalogueError,
    add_described_recipes,
    add_ingredient,
    copy_recipe,
    set_visibility,
    turn_on_share_link,
)


@dataclass(frozen=True)
class SeededAccount:
    email: str
    name: str
    session: str
    recipes: list[Recipe]


def seed(households: list[dict[str, Any]]) -> dict[str, SeededAccount]:
    """Makes the described households, members, recipes, saves, lists and copies, then makes private the recipes
    named and shares by link the ones named, in one transaction, and signs each member in. Keyed by each member's key.
    Raises CatalogueError for a recipe the database can't hold, or a save, list, copy or change it can't make."""
    with transaction.atomic():
        made = [pair for household in households for pair in _add_household(household)]
        # Before any recipe, so a recipe can name an ingredient another member added.
        for name in (name for member, _ in made for name in member['added_ingredients']):
            add_ingredient(name)
        recipes = {member['key']: add_described_recipes(account, member['recipes']) for member, account in made}
        seeded = {recipe.title: recipe for made_by in recipes.values() for recipe in made_by}
        for member, account in made:
            for title in member['saves']:
                save_to_favourites(account, _recipe_they_can_see(title, seeded, account, 'save'))
        for member, account in made:
            for described in member['lists']:
                _add_list(account, described, seeded)
        for member, account in made:
            recipes[member['key']] += [
                copy_recipe(_recipe_they_can_see(title, seeded, account, 'copy'), account) for title in member['copies']
            ]
        for member, account in made:
            for title in member['made_private']:
                set_visibility(
                    _recipe_they_wrote(title, recipes[member['key']], account, 'make "{}" private'),
                    Visibility.PRIVATE,
                )
        for member, account in made:
            for title in member['shared']:
                _share(_recipe_they_wrote(title, recipes[member['key']], account, 'share "{}" by link'))
        return {
            member['key']: SeededAccount(
                email=account.email, name=account.name, session=start_session(account), recipes=recipes[member['key']]
            )
            for member, account in made
        }


def _add_household(household: dict[str, Any]) -> list[tuple[dict[str, Any], User]]:
    members = household['members']
    test_members = [
        TestMember(member['key'], member['name'], member.get('unit_system', UnitSystem.METRIC)) for member in members
    ]
    return list(zip(members, add_test_household(household.get('name'), test_members), strict=True))


def _add_list(account: User, described: dict[str, Any], seeded: dict[str, Recipe]) -> None:
    scope = Scope(described.get('scope', Scope.PERSONAL))
    try:
        made = make_list(account, described['name'], scope)
    except ValidationError as error:
        raise CatalogueError(
            f'{account.name} can\'t make the list "{described["name"]}": {error.messages[0]}'
        ) from error
    for title in described['recipes']:
        save_to_list(account, scope, made.slug, _recipe_they_can_see(title, seeded, account, 'add'))


def _recipe_they_can_see(title: str, seeded: dict[str, Recipe], account: User, action: str) -> Recipe:
    recipe = seeded.get(title) or Recipe.objects.catalogue().filter(title=title).first()
    if recipe is None or not Recipe.objects.visible_to(account).filter(pk=recipe.pk).exists():
        raise CatalogueError(f'{account.name} can\'t {action} "{title}": no recipe they can see has that title.')
    return recipe


def _recipe_they_wrote(title: str, written: list[Recipe], account: User, action: str) -> Recipe:
    """The recipe the account wrote with this title; `action` says what they'd do with it, `{}` for the title."""
    recipe = next((recipe for recipe in written if recipe.title == title), None)
    if recipe is None:
        doing = action.replace('{}', title)
        raise CatalogueError(f"{account.name} can't {doing}: they wrote no recipe with that title.")
    return recipe


def _share(recipe: Recipe) -> None:
    try:
        turn_on_share_link(recipe)
    except ValidationError as error:
        raise CatalogueError(f'"{recipe.title}" is public, so it can\'t be shared by link.') from error
