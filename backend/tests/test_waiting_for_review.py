from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from django.contrib.messages import get_messages
from django.http import HttpResponse
from django.test import Client
from django.urls import reverse
from django.utils.html import escape
from pytest_django.fixtures import Settings

from households.models import User
from recipes.models import Recipe, ShareLink, Step
from tests.conftest import Clock
from tests.test_accounts import BrowserClient
from tests.test_copying_recipes import copy
from tests.test_editing_recipes import RECIPES, add
from tests.test_household import join, leave, signed_up
from tests.test_private_recipes import stranger
from tests.test_publishing_recipes import publish
from tests.test_recipes import add_line, make_recipe
from tests.test_saving_recipes import save
from tests.test_seed import seed, seeded
from tests.test_sharing_recipes import turn_on

MILO = 'milo@example.com'
WAITING = reverse('admin:recipes_heldrecipe_changelist')


def complete(author: BrowserClient, title: str) -> str:
    """A private recipe with everything a public one needs."""
    slug = add(author, {'title': title, 'prep_minutes': 10, 'cook_minutes': 20, 'servings': 2})
    recipe = Recipe.objects.get(slug=slug)
    add_line(recipe, 'onion')
    Step.objects.create(recipe=recipe, text='Fry the onion.')
    return slug


def milos_recipes(count: int) -> tuple[BrowserClient, list[str]]:
    milo = signed_up(MILO, 'Milo')
    return milo, [complete(milo, f'Recipe {number}') for number in range(1, count + 1)]


def answered(response: HttpResponse) -> tuple[int, str, bool]:
    body = response.json()
    return response.status_code, body['visibility'], body['waiting_for_review']


def state_of(slug: str) -> tuple[str, str]:
    recipe = Recipe.objects.get(slug=slug)
    return recipe.visibility, recipe.moderation


def waiting_by_four() -> tuple[BrowserClient, list[str]]:
    """Milo's 4 recipes made public today, the last waiting for review."""
    milo, slugs = milos_recipes(4)
    for slug in slugs:
        publish(milo, slug)
    return milo, slugs


@pytest.mark.django_db
def test_an_accounts_4th_and_later_recipes_made_public_in_a_day_wait_for_review() -> None:
    milo, slugs = milos_recipes(5)

    answers = [answered(publish(milo, slug)) for slug in slugs]

    assert answers == [
        (200, 'public', False),
        (200, 'public', False),
        (200, 'public', False),
        (200, 'private', True),
        (200, 'private', True),
    ]
    assert [state_of(slug) for slug in slugs[3:]] == [('private', 'held'), ('private', 'held')]


@pytest.mark.django_db
def test_nobody_else_sees_a_recipe_waiting_for_review() -> None:
    milo, slugs = waiting_by_four()
    jo = signed_up('jo@example.com', 'Jo')

    seen_by_jo = jo.client.get(f'{RECIPES}{slugs[3]}/').status_code
    seen_signed_out = stranger().client.get(f'{RECIPES}{slugs[3]}/').status_code
    listed_for_jo = [recipe['slug'] for recipe in jo.client.get(RECIPES).json()]

    assert (seen_by_jo, seen_signed_out) == (404, 404)
    assert listed_for_jo == slugs[:3]
    listed_for_milo = {recipe['slug']: recipe['waiting_for_review'] for recipe in milo.client.get(RECIPES).json()}
    assert listed_for_milo == {slugs[0]: False, slugs[1]: False, slugs[2]: False, slugs[3]: True}


@pytest.mark.django_db
def test_making_one_recipe_public_again_the_same_day_counts_it_once() -> None:
    milo, slugs = milos_recipes(4)
    for visibility in ['public', 'private', 'public', 'private', 'public']:
        publish(milo, slugs[0], visibility)

    answers = [answered(publish(milo, slug)) for slug in slugs[1:]]

    assert answers == [(200, 'public', False), (200, 'public', False), (200, 'private', True)]


@pytest.mark.django_db
@pytest.mark.parametrize('withdrawn', [False, True], ids=['4th waiting', '4th withdrawn'])
def test_a_days_first_recipes_stay_public_when_made_public_again_after_a_4th(withdrawn: bool) -> None:
    milo, slugs = waiting_by_four()
    if withdrawn:
        publish(milo, slugs[3], 'private')

    made_private = publish(milo, slugs[0], 'private').json()['will_wait_for_review']

    assert (made_private, answered(publish(milo, slugs[0]))) == (False, (200, 'public', False))
    assert answered(publish(milo, slugs[3])) == (200, 'private', True)


@pytest.mark.django_db
def test_recipes_made_public_on_an_earlier_day_dont_count(clock: Clock) -> None:
    milo, slugs = milos_recipes(4)
    for slug in slugs[:3]:
        publish(milo, slug)
    clock.now += timedelta(days=1)

    assert answered(publish(milo, slugs[3])) == (200, 'public', False)


@pytest.mark.django_db
@pytest.mark.parametrize(
    ('fourth_at', 'expected'),
    [
        # 23:30 in London (BST), the day the others were made public.
        pytest.param(datetime(2026, 7, 1, 22, 30, tzinfo=UTC), (200, 'private', True), id='before midnight'),
        # 00:30 the next day in London, though still 1 July in UTC.
        pytest.param(datetime(2026, 7, 1, 23, 30, tzinfo=UTC), (200, 'public', False), id='after midnight'),
    ],
)
def test_a_day_runs_from_midnight_in_london(clock: Clock, fourth_at: datetime, expected: tuple[Any, ...]) -> None:
    milo, slugs = milos_recipes(4)
    clock.now = datetime(2026, 7, 1, 12, 0, tzinfo=UTC)
    for slug in slugs[:3]:
        publish(milo, slug)
    clock.now = fourth_at

    assert answered(publish(milo, slugs[3])) == expected


@pytest.mark.django_db
def test_only_the_authors_own_recipes_count() -> None:
    milo, slugs = milos_recipes(3)
    ben = signed_up('ben@example.com', 'Ben')
    join('ben@example.com', MILO)
    bens = complete(ben, "Ben's dal")
    for slug in slugs:
        publish(milo, slug)

    assert answered(publish(ben, bens)) == (200, 'public', False)


@pytest.mark.django_db
def test_a_copy_of_a_recipe_made_public_today_doesnt_count_for_whoever_copies_it() -> None:
    _, slugs = waiting_by_four()
    jo = signed_up('jo@example.com', 'Jo')
    for slug in slugs[:3]:
        copy(jo, slug)

    assert answered(publish(jo, complete(jo, "Jo's dal"))) == (200, 'public', False)


@pytest.mark.django_db
def test_asking_again_while_it_waits_changes_nothing() -> None:
    milo, slugs = waiting_by_four()

    assert answered(publish(milo, slugs[3])) == (200, 'private', True)
    assert state_of(slugs[3]) == ('private', 'held')


@pytest.mark.django_db
def test_making_it_private_withdraws_it_and_asking_again_waits_again() -> None:
    milo, slugs = waiting_by_four()

    withdrawn = answered(publish(milo, slugs[3], 'private'))
    state_once_withdrawn = state_of(slugs[3])
    asked_again = answered(publish(milo, slugs[3]))

    assert (withdrawn, state_once_withdrawn) == ((200, 'private', False), ('private', 'unreported'))
    assert asked_again == (200, 'private', True)


@pytest.mark.django_db
def test_the_page_says_whether_making_it_public_would_wait_for_review() -> None:
    milo, slugs = milos_recipes(5)
    ben = signed_up('ben@example.com', 'Ben')
    join('ben@example.com', MILO)
    before = milo.client.get(f'{RECIPES}{slugs[3]}/').json()['will_wait_for_review']
    for slug in slugs[:4]:
        publish(milo, slug)

    def will_wait(browser: BrowserClient, slug: str) -> bool:
        return browser.client.get(f'{RECIPES}{slug}/').json()['will_wait_for_review']

    assert (before, will_wait(milo, slugs[4]), will_wait(ben, slugs[4])) == (False, True, False)
    # Public, and waiting already.
    assert (will_wait(milo, slugs[0]), will_wait(milo, slugs[3])) == (False, False)


@pytest.mark.django_db
def test_asking_stops_its_share_link_and_none_can_be_turned_on_while_it_waits() -> None:
    milo, slugs = milos_recipes(4)
    turn_on(milo, slugs[3])
    for slug in slugs:
        publish(milo, slug)

    refused = turn_on(milo, slugs[3])

    assert ShareLink.objects.filter(recipe__slug=slugs[3]).exists() is False
    assert (refused.status_code, refused.json()) == (
        400,
        {'share_link': ['This recipe will be public once staff approve it, so it has no share link.']},
    )
    assert milo.client.get(f'{RECIPES}{slugs[3]}/').json()['can_share'] is False
    assert milo.client.get(f'{RECIPES}{slugs[3]}/').json()['can_publish'] is True


@pytest.mark.django_db
def test_a_saved_recipe_waiting_for_review_says_so_in_favourites() -> None:
    milo, slugs = waiting_by_four()
    save(milo, slugs[3])

    [entry] = milo.client.get('/api/lists/favourites/').json()['saved_recipes']

    assert entry['recipe']['waiting_for_review'] is True


@pytest.mark.django_db
def test_a_recipe_its_author_leaves_behind_stops_waiting_and_their_copy_doesnt_wait() -> None:
    milo, slugs = waiting_by_four()
    signed_up('ann@example.com', 'Ann')
    join('ann@example.com', MILO)

    leave(milo)

    assert state_of(slugs[3]) == ('private', 'unreported')
    copies = Recipe.objects.filter(created_by__email=MILO, title='Recipe 4').exclude(slug=slugs[3])
    assert [recipe.moderation for recipe in copies] == ['unreported']


def approve(admin_client: Client, *slugs: str) -> HttpResponse:
    """Staff tick the recipes in the list of recipes waiting for review and approve them."""
    chosen = [Recipe.objects.get(slug=slug).pk for slug in slugs]
    return admin_client.post(WAITING, {'action': 'approve', '_selected_action': chosen}, follow=True)


def said(response: HttpResponse) -> list[str]:
    return [str(message) for message in get_messages(response.wsgi_request)]


@pytest.mark.django_db
def test_staff_see_the_recipes_waiting_for_review_asked_for_first_at_the_top(
    admin_client: Client, clock: Clock
) -> None:
    make_recipe(title='Catalogue tart')
    milo, slugs = milos_recipes(6)
    for slug in slugs[:5]:
        publish(milo, slug)
        clock.now += timedelta(minutes=1)
    publish(milo, slugs[5], 'private')

    page = admin_client.get(WAITING).content.decode()

    listed = [title for title in ['Recipe 1', 'Recipe 4', 'Recipe 5', 'Recipe 6', 'Catalogue tart'] if title in page]
    assert listed == ['Recipe 4', 'Recipe 5']
    assert page.index('Recipe 4') < page.index('Recipe 5')
    assert escape('Milo (milo@example.com)') in page


@pytest.mark.django_db
def test_staff_read_a_waiting_recipe_on_its_page_and_cant_change_it(admin_client: Client) -> None:
    _, slugs = waiting_by_four()
    recipe = Recipe.objects.get(slug=slugs[3])

    page = admin_client.get(reverse('admin:recipes_heldrecipe_change', args=[recipe.pk])).content.decode()

    assert 'Fry the onion.' in page
    assert 'name="_save"' not in page


@pytest.mark.django_db
def test_staff_approve_a_waiting_recipe_and_everyone_finds_it(admin_client: Client) -> None:
    _, slugs = waiting_by_four()

    response = approve(admin_client, slugs[3])

    assert said(response) == ['Approved Recipe 4.']
    assert state_of(slugs[3]) == ('public', 'unreported')
    assert stranger().client.get(f'{RECIPES}{slugs[3]}/').json()['author'] == 'Milo'
    assert 'Recipe 4' not in admin_client.get(WAITING).content.decode()


@pytest.mark.django_db
def test_approving_a_recipe_its_author_withdrew_changes_nothing(admin_client: Client) -> None:
    milo, slugs = waiting_by_four()
    publish(milo, slugs[3], 'private')

    response = approve(admin_client, slugs[3])

    assert not any(message.startswith('Approved') for message in said(response))
    assert state_of(slugs[3]) == ('private', 'unreported')


@pytest.mark.django_db
def test_a_waiting_recipe_edited_to_lack_something_isnt_approved(admin_client: Client) -> None:
    _, slugs = waiting_by_four()
    Step.objects.filter(recipe__slug=slugs[3]).delete()

    response = approve(admin_client, slugs[3])

    assert said(response) == ["Couldn't approve Recipe 4: It needs a method before it can be public."]
    assert state_of(slugs[3]) == ('private', 'held')


@pytest.mark.django_db
def test_a_seeded_member_makes_recipes_public_and_the_4th_waits(test_accounts: Settings) -> None:
    recipe = {'prep_minutes': 10, 'cook_minutes': 20, 'servings': 2, 'ingredient_lines': [{'ingredient': 'onion'}]}
    titles = [f'Recipe {number}' for number in range(1, 5)]
    add_line(make_recipe(title='Catalogue tart'), 'onion')
    body = seeded(
        {
            'members': [
                {
                    'key': 'sam',
                    'name': 'Sam',
                    'recipes': [{'title': title, **recipe, 'steps': ['Fry the onion.']} for title in titles],
                    'made_public': titles,
                }
            ]
        }
    )

    slugs = [seeded_recipe['slug'] for seeded_recipe in body['accounts']['sam']['recipes']]
    assert [state_of(slug) for slug in slugs] == [
        ('public', 'unreported'),
        ('public', 'unreported'),
        ('public', 'unreported'),
        ('private', 'held'),
    ]


@pytest.mark.django_db
def test_a_seeded_member_cant_make_public_a_recipe_missing_something(test_accounts: Settings) -> None:
    response = seed(
        {
            'households': [
                {'members': [{'key': 'sam', 'name': 'Sam', 'recipes': [{'title': 'Toast'}], 'made_public': ['Toast']}]}
            ]
        }
    )

    assert (response.status_code, response.json()) == (
        400,
        [
            '"Toast" can\'t be made public: Add ingredients, a method, a prep time, a cook time and servings or a '
            'yield before making it public.'
        ],
    )
    assert User.objects.count() == 0
