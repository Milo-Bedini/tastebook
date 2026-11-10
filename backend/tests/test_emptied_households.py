"""Everything a household_emptied receiver deletes is named by the screens that confirm emptying a household: the
invite lookup before joining another, and the deletion preview before deleting the last member's account. A receiver
added without a row here fails the first test; a row whose count is missing fails the others."""

from collections.abc import Callable
from dataclasses import dataclass

import pytest
from django.core.cache import cache

from households.signals import household_emptied
from recipe_collections.models import RecipeList
from recipes.models import Recipe
from tests.test_accounts import BrowserClient
from tests.test_deleting_accounts import ask_for_code, delete, deletion_code, see, written_by
from tests.test_household import household_id_of, make_link, signed_up
from tests.test_join import join_through, lookup, make_list

MILO = 'milo@example.com'


@dataclass(frozen=True)
class Deleted:
    """One kind of thing a household_emptied receiver deletes."""

    receiver: str
    make: Callable[[BrowserClient], None]
    left_in: Callable[[int], int]
    joining_count: str
    # None while the deletion preview doesn't name it: say why, and file the gap.
    deleting_count: str | None


DELETED = [
    Deleted(
        receiver='collections-drop-household-lists',
        make=lambda milo: make_list(milo, 'Bakes', 'household'),
        left_in=lambda household: RecipeList.objects.filter(household_id=household).count(),
        joining_count='lists_to_delete',
        # The deletion screen says only that personal lists go; household lists aren't counted for it yet.
        deleting_count=None,
    ),
    Deleted(
        receiver='recipes-delete-emptied-households-private-recipes',
        make=lambda _: written_by(MILO, 'Soda bread'),
        left_in=lambda household: Recipe.objects.filter(household_id=household).count(),
        joining_count='recipes_to_copy',
        deleting_count='private_recipes',
    ),
]


def test_every_household_emptied_receiver_has_a_row() -> None:
    receivers = {dispatch_uid for (dispatch_uid, _), *_ in household_emptied.receivers}

    assert receivers == {deleted.receiver for deleted in DELETED}


@pytest.mark.django_db
@pytest.mark.parametrize('deleted', DELETED, ids=lambda deleted: deleted.receiver)
def test_joining_another_household_names_what_its_emptied_household_deletes(deleted: Deleted) -> None:
    milo = signed_up(MILO, 'Milo')
    jo = signed_up('jo@example.com', 'Jo')
    token = make_link(jo).json()['invite']['token']
    before = lookup(milo, token).json()[deleted.joining_count]
    deleted.make(milo)
    old = household_id_of(MILO)

    assert (before, lookup(milo, token).json()[deleted.joining_count]) == (0, 1)

    join_through(milo, token)

    assert deleted.left_in(old) == 0


@pytest.mark.django_db
@pytest.mark.parametrize(
    'deleted', [deleted for deleted in DELETED if deleted.deleting_count], ids=lambda deleted: deleted.receiver
)
def test_deleting_the_last_member_names_what_its_emptied_household_deletes(deleted: Deleted) -> None:
    # Deletion codes count towards sign-in's limit, kept in the cache across tests.
    cache.clear()
    milo = signed_up(MILO, 'Milo')
    before = see(milo).json()[deleted.deleting_count]
    deleted.make(milo)
    old = household_id_of(MILO)

    assert (before, see(milo).json()[deleted.deleting_count]) == (0, 1)

    ask_for_code(milo)
    delete(milo, deletion_code(MILO))

    assert deleted.left_in(old) == 0
