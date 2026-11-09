from collections.abc import Callable
from typing import Any

import pytest
from django.http import HttpResponse
from rest_framework.test import APIClient

from households.models import User
from recipes.models import Recipe, ShareLink
from tests.test_accounts import BrowserClient
from tests.test_editing_recipes import MILO, RECIPES, complete_curry
from tests.test_household import join, leave, make_link, member, remove, signed_up
from tests.test_join import join_through
from tests.test_moving_recipes import ANN, JO
from tests.test_private_recipes import another_household, another_member, its_author, stranger
from tests.test_publishing_recipes import publish

SHARED = '/api/shared/'


def turn_on(browser: BrowserClient, slug: str) -> HttpResponse:
    return browser.client.put(f'{RECIPES}{slug}/share-link/', **browser.csrf_header())


def turn_off(browser: BrowserClient, slug: str) -> HttpResponse:
    return browser.client.delete(f'{RECIPES}{slug}/share-link/', **browser.csrf_header())


def open_link(token: str, client: APIClient | None = None) -> HttpResponse:
    return (client or APIClient()).get(f'{SHARED}{token}/')


def shared_curry() -> tuple[BrowserClient, str, str]:
    """Milo's complete curry, private, with its share link on: Milo, its slug and the link's token."""
    milo, slug = complete_curry()
    token = turn_on(milo, slug).json()['share_token']
    return milo, slug, token


@pytest.mark.django_db
def test_the_author_turns_a_link_on_and_anyone_opens_the_recipe_with_it() -> None:
    milo, slug = complete_curry()

    response = turn_on(milo, slug)

    body = response.json()
    assert (response.status_code, body['can_share'], body['visibility']) == (200, True, 'private')
    assert len(body['share_token']) == 43
    opened = open_link(body['share_token'])
    recipe = opened.json()
    assert (opened.status_code, opened['X-Robots-Tag']) == (200, 'noindex')
    assert (recipe['title'], [step['text'] for step in recipe['steps']]) == (
        "Grandma's curry",
        ['Fry the onions.', 'Add the tomatoes.'],
    )
    assert [line['ingredient']['name'] for line in recipe['ingredient_lines']] == ['onion']
    assert [
        (group['name'], [line['ingredient']['name'] for line in group['lines']])
        for group in recipe['ingredient_groups']
    ] == [('For the sauce', ['tomato'])]


@pytest.mark.django_db
def test_the_shared_recipe_says_nothing_of_its_household() -> None:
    _, _, token = shared_curry()

    recipe = open_link(token).json()

    assert sorted(recipe) == [
        'cook_minutes',
        'courses',
        'cuisines',
        'description',
        'diet_tag_conflicts',
        'diet_tags',
        'difficulty',
        'equipment',
        'extra_label',
        'extra_minutes',
        'id',
        'ingredient_groups',
        'ingredient_lines',
        'one_pot',
        'original_source',
        'original_source_url',
        'photo',
        'prep_minutes',
        'servings',
        'source',
        'source_url',
        'steps',
        'title',
        'total_minutes',
        'yield_amount',
        'yield_unit',
    ]


@pytest.mark.django_db
def test_a_signed_in_account_of_any_household_opens_the_same_page() -> None:
    _, _, token = shared_curry()
    jo = another_household()

    signed_in = open_link(token, jo.client)

    assert (signed_in.status_code, signed_in.json()) == (200, open_link(token).json())


@pytest.mark.django_db
def test_turning_a_link_on_again_keeps_the_one_that_is_on() -> None:
    milo, slug, token = shared_curry()

    response = turn_on(milo, slug)

    assert (response.status_code, response.json()['share_token']) == (200, token)
    assert ShareLink.objects.count() == 1


@pytest.mark.django_db
def test_a_link_turned_off_shows_nothing_and_turning_it_on_again_makes_a_new_one() -> None:
    milo, slug, token = shared_curry()

    off = turn_off(milo, slug)
    gone = open_link(token)
    again = turn_on(milo, slug).json()['share_token']

    assert (off.status_code, off.json()['share_token']) == (200, None)
    assert (gone.status_code, gone['X-Robots-Tag'], gone.json()) == (404, 'noindex', {'detail': 'Not found.'})
    assert again != token
    assert (open_link(token).status_code, open_link(again).status_code) == (404, 200)


@pytest.mark.django_db
def test_turning_off_a_link_that_is_off_changes_nothing() -> None:
    milo, slug = complete_curry()

    response = turn_off(milo, slug)

    assert (response.status_code, response.json()['share_token']) == (200, None)


@pytest.mark.django_db
def test_a_token_no_link_ever_had_shows_nothing() -> None:
    shared_curry()

    response = open_link('never-a-share-link')

    assert (response.status_code, response['X-Robots-Tag']) == (404, 'noindex')


@pytest.mark.django_db
@pytest.mark.parametrize(
    ('viewer', 'status'),
    [
        pytest.param(stranger, 403, id='signed out'),
        pytest.param(another_household, 404, id='another household'),
        pytest.param(another_member, 404, id='another member'),
    ],
)
@pytest.mark.parametrize('send', [pytest.param(turn_on, id='on'), pytest.param(turn_off, id='off')])
def test_only_the_author_turns_a_link_on_or_off(
    viewer: Callable[[], BrowserClient], status: int, send: Callable[[BrowserClient, str], HttpResponse]
) -> None:
    _, slug, token = shared_curry()

    response = send(viewer(), slug)

    assert response.status_code == status
    assert list(ShareLink.objects.values_list('token', flat=True)) == [token]


@pytest.mark.django_db
@pytest.mark.parametrize(
    ('viewer', 'can_share', 'has_token'),
    [
        pytest.param(its_author, True, True, id='its author'),
        pytest.param(another_member, False, False, id='another member'),
    ],
)
def test_only_the_author_is_told_the_link(
    viewer: Callable[[], BrowserClient], can_share: bool, has_token: bool
) -> None:
    _, slug, _ = shared_curry()

    recipe = viewer().client.get(f'{RECIPES}{slug}/').json()

    assert (recipe['can_share'], recipe['share_token'] is not None) == (can_share, has_token)


@pytest.mark.django_db
def test_a_public_recipe_has_no_link_to_turn_on() -> None:
    milo, slug = complete_curry()
    publish(milo, slug)

    response = turn_on(milo, slug)

    assert (response.status_code, response.json()) == (
        400,
        {'share_link': ['A public recipe is open to anyone already, so it has no share link.']},
    )
    assert ShareLink.objects.count() == 0
    assert milo.client.get(f'{RECIPES}{slug}/').json()['can_share'] is False


@pytest.mark.django_db
def test_making_the_recipe_public_stops_its_link_for_good() -> None:
    milo, slug, token = shared_curry()

    publish(milo, slug)
    stopped = open_link(token).status_code
    private_again = publish(milo, slug, 'private').json()

    assert stopped == 404
    assert (private_again['can_share'], private_again['share_token']) == (True, None)
    assert open_link(token).status_code == 404


@pytest.mark.django_db
def test_deleting_the_recipe_stops_its_link() -> None:
    milo, slug, token = shared_curry()

    milo.client.delete(f'{RECIPES}{slug}/', **milo.csrf_header())

    assert open_link(token).status_code == 404


def leaves(milo: BrowserClient, ann: BrowserClient) -> None:
    leave(milo)


def is_removed(milo: BrowserClient, ann: BrowserClient) -> None:
    remove(ann, member(MILO))


def joins_jo(milo: BrowserClient, ann: BrowserClient) -> None:
    jo = signed_up(JO, 'Jo')
    join_through(milo, make_link(jo).json()['invite']['token'])


@pytest.mark.django_db
@pytest.mark.parametrize(
    'move',
    [
        pytest.param(leaves, id='leaving'),
        pytest.param(is_removed, id='being removed'),
        pytest.param(joins_jo, id='joining another household'),
    ],
)
def test_the_author_moving_household_stops_the_link_and_their_copy_has_none(
    move: Callable[[BrowserClient, BrowserClient], None],
) -> None:
    milo, slug, token = shared_curry()
    ann = signed_up(ANN, 'Ann')
    join(ANN, MILO)

    move(milo, ann)

    milos_copy = Recipe.objects.get(
        created_by=User.objects.get(email=MILO), household=User.objects.get(email=MILO).household
    )
    copy: dict[str, Any] = milo.client.get(f'{RECIPES}{milos_copy.slug}/').json()
    assert open_link(token).status_code == 404
    assert (copy['can_share'], copy['share_token']) == (True, None)
    assert ann.client.get(f'{RECIPES}{slug}/').json()['share_token'] is None
