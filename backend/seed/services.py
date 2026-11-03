from dataclasses import dataclass
from typing import Any

from django.db import transaction

from households.models import UnitSystem, User
from households.services import TestMember, add_test_household, start_session
from recipes.models import Recipe
from recipes.services import add_described_recipes


@dataclass(frozen=True)
class SeededAccount:
    email: str
    name: str
    session: str
    recipes: list[Recipe]


def seed(households: list[dict[str, Any]]) -> dict[str, SeededAccount]:
    """Makes the described households, members and recipes in one transaction and signs each member in.
    Keyed by each member's key. Raises CatalogueError for a recipe the database can't hold."""
    with transaction.atomic():
        made = [pair for household in households for pair in _add_household(household)]
        recipes = {member['key']: add_described_recipes(account, member['recipes']) for member, account in made}
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
