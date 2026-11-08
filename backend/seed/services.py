from dataclasses import dataclass
from typing import Any

from django.db import transaction

from households.models import UnitSystem, User
from households.services import TestMember, add_test_household, start_session
from recipe_collections.services import save_to_favourites
from recipes.models import Recipe
from recipes.services import CatalogueError, add_described_recipes, add_ingredient, copy_recipe


@dataclass(frozen=True)
class SeededAccount:
    email: str
    name: str
    session: str
    recipes: list[Recipe]


def seed(households: list[dict[str, Any]]) -> dict[str, SeededAccount]:
    """Makes the described households, members, recipes, saves and copies in one transaction and signs each member in.
    Keyed by each member's key. Raises CatalogueError for a recipe the database can't hold, or a save or copy it can't
    make."""
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
            recipes[member['key']] += [
                copy_recipe(_recipe_they_can_see(title, seeded, account, 'copy'), account) for title in member['copies']
            ]
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


def _recipe_they_can_see(title: str, seeded: dict[str, Recipe], account: User, action: str) -> Recipe:
    recipe = seeded.get(title) or Recipe.objects.catalogue().filter(title=title).first()
    if recipe is None or not Recipe.objects.visible_to(account).filter(pk=recipe.pk).exists():
        raise CatalogueError(f'{account.name} can\'t {action} "{title}": no recipe they can see has that title.')
    return recipe
