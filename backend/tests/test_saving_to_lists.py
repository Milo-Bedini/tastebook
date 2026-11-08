from typing import Any

import pytest
from django.db import connection
from django.http import HttpResponse
from django.test.utils import CaptureQueriesContext

from recipe_collections.models import RecipeList, SavedRecipe
from recipes.models import Recipe
from tests.test_accounts import BrowserClient
from tests.test_editing_recipes import MILO, ben_in_milos_household, milos_curry
from tests.test_household import signed_up
from tests.test_lists import make, path, titles
from tests.test_recipes import make_recipe
from tests.test_saving_recipes import save, unsave

JO = 'jo@example.com'


def holding(slug: str) -> str:
    return f'/api/lists/recipes/{slug}/'


def save_to(browser: BrowserClient, slug: str, scope: str, list_slug: str) -> HttpResponse:
    return browser.client.post(
        holding(slug), {'scope': scope, 'list': list_slug}, format='json', **browser.csrf_header()
    )


def places(browser: BrowserClient, slug: str) -> list[tuple[str, str, int, bool]]:
    """Each list the recipe's page offers as its scope, slug and count, and whether it holds the recipe."""
    lists = browser.client.get(holding(slug)).json()['lists']
    return [(found['scope'], found['slug'], found['recipe_count'], found['saved_id'] is not None) for found in lists]


def milo_with_lists() -> BrowserClient:
    milo = signed_up(MILO, 'Milo')
    make(milo, 'Weeknight dinners')
    make(milo, 'Sunday roasts', 'household')
    return milo


@pytest.mark.django_db
def test_a_recipe_s_page_offers_every_list_you_see_and_says_which_hold_it() -> None:
    milo = milo_with_lists()
    make(milo, 'Christmas', 'household')
    chana = make_recipe(title='Chana masala')
    save_to(milo, chana.slug, 'household', 'sunday-roasts')
    save_to(milo, make_recipe(title='Baklava').slug, 'personal', 'weeknight-dinners')

    response = milo.client.get(holding(chana.slug))

    assert (response.status_code, response.json()['household_name']) == (200, "Milo's household")
    # Favourites is offered before anything is saved to it.
    assert places(milo, chana.slug) == [
        ('personal', 'favourites', 0, False),
        ('personal', 'weeknight-dinners', 1, False),
        ('household', 'christmas', 0, False),
        ('household', 'sunday-roasts', 1, True),
    ]
    assert [found['name'] for found in response.json()['lists']] == [
        'Favourites',
        'Weeknight dinners',
        'Christmas',
        'Sunday roasts',
    ]


@pytest.mark.parametrize(('scope', 'list_slug'), [('personal', 'weeknight-dinners'), ('household', 'sunday-roasts')])
@pytest.mark.django_db
def test_saving_to_a_list_keeps_one_link_however_often_it_s_saved(scope: str, list_slug: str) -> None:
    milo = milo_with_lists()
    chana = make_recipe(title='Chana masala')

    first = save_to(milo, chana.slug, scope, list_slug)
    again = save_to(milo, chana.slug, scope, list_slug)

    assert (first.status_code, first.json()['title'], first.json()['recipe']['slug']) == (
        201,
        'Chana masala',
        'chana-masala',
    )
    assert (again.status_code, again.json()['id']) == (200, first.json()['id'])
    assert titles(milo, path(list_slug, scope)) == [('Chana masala', 'chana-masala')]
    assert Recipe.objects.filter(title='Chana masala').count() == 1


@pytest.mark.django_db
def test_a_recipe_can_be_in_any_number_of_lists_and_unsaving_takes_it_out_of_one() -> None:
    milo = milo_with_lists()
    chana = make_recipe(title='Chana masala')
    for scope, list_slug in [
        ('personal', 'favourites'),
        ('personal', 'weeknight-dinners'),
        ('household', 'sunday-roasts'),
    ]:
        save_to(milo, chana.slug, scope, list_slug)
    saved_in = {found['slug']: found['saved_id'] for found in milo.client.get(holding(chana.slug)).json()['lists']}

    removed = unsave(milo, saved_in['weeknight-dinners'])

    assert removed.status_code == 200
    assert places(milo, chana.slug) == [
        ('personal', 'favourites', 1, True),
        ('personal', 'weeknight-dinners', 0, False),
        ('household', 'sunday-roasts', 1, True),
    ]
    # Favourites saved from here is the heart's Favourites.
    assert titles(milo, path('favourites')) == [('Chana masala', 'chana-masala')]


@pytest.mark.django_db
def test_the_heart_s_save_shows_as_favourites_holding_it() -> None:
    milo = milo_with_lists()
    chana = make_recipe(title='Chana masala')

    saved = save(milo, chana.slug).json()

    favourites = milo.client.get(holding(chana.slug)).json()['lists'][0]
    assert (favourites['slug'], favourites['saved_id']) == ('favourites', saved['id'])


@pytest.mark.django_db
def test_a_household_s_private_recipe_goes_in_any_of_its_members_lists() -> None:
    milo, curry = milos_curry()
    make(milo, 'Weeknight dinners')
    make(milo, 'Sunday roasts', 'household')
    ben = ben_in_milos_household()

    answers = [
        save_to(milo, curry, 'personal', 'weeknight-dinners').status_code,
        save_to(ben, curry, 'household', 'sunday-roasts').status_code,
    ]

    assert answers == [201, 201]
    assert [holds for *_, holds in places(milo, curry)] == [False, True, True]


def another_account_s_list(jo: BrowserClient, slug: str) -> HttpResponse:
    return save_to(jo, slug, 'personal', 'weeknight-dinners')


def another_household_s_list(jo: BrowserClient, slug: str) -> HttpResponse:
    return save_to(jo, slug, 'household', 'sunday-roasts')


def no_such_list(jo: BrowserClient, slug: str) -> HttpResponse:
    return save_to(jo, slug, 'personal', 'puddings')


@pytest.mark.parametrize('attempt', [another_account_s_list, another_household_s_list, no_such_list])
@pytest.mark.django_db
def test_nobody_saves_to_a_list_that_isn_t_theirs_or_their_household_s(attempt: Any) -> None:
    milo_with_lists()
    chana = make_recipe(title='Chana masala')
    jo = signed_up(JO, 'Jo')

    response = attempt(jo, chana.slug)

    assert response.status_code == 404
    assert SavedRecipe.objects.count() == 0


@pytest.mark.django_db
def test_another_household_s_private_recipe_is_neither_offered_nor_saved() -> None:
    _, curry = milos_curry()
    jo = signed_up(JO, 'Jo')
    make(jo, 'Weeknight dinners')

    answers = [
        jo.client.get(holding(curry)).status_code,
        save_to(jo, curry, 'personal', 'weeknight-dinners').status_code,
        save_to(jo, curry, 'personal', 'favourites').status_code,
        jo.client.get(holding('no-such-recipe')).status_code,
    ]

    assert answers == [404, 404, 404, 404]
    assert SavedRecipe.objects.count() == 0
    # The same account reaches a recipe it can see.
    assert save_to(jo, make_recipe(title='Baklava').slug, 'personal', 'weeknight-dinners').status_code == 201


@pytest.mark.parametrize(
    'body',
    [
        pytest.param({'list': 'weeknight-dinners'}, id='no scope'),
        pytest.param({'scope': 'personal'}, id='no list'),
        pytest.param({'scope': 'everyone', 'list': 'weeknight-dinners'}, id='no such scope'),
    ],
)
@pytest.mark.django_db
def test_a_save_without_its_list_is_refused(body: dict[str, str]) -> None:
    milo = milo_with_lists()
    chana = make_recipe(title='Chana masala')

    response = milo.client.post(holding(chana.slug), body, format='json', **milo.csrf_header())

    assert response.status_code == 400
    assert SavedRecipe.objects.count() == 0


@pytest.mark.parametrize(
    ('method', 'body'),
    [pytest.param('get', None, id='GET'), pytest.param('post', {'scope': 'personal', 'list': 'favourites'}, id='POST')],
)
@pytest.mark.django_db
def test_signed_out_a_recipe_s_lists_are_neither_seen_nor_saved_to(method: str, body: dict[str, str] | None) -> None:
    chana = make_recipe(title='Chana masala')
    browser = BrowserClient()

    response = getattr(browser.client, method)(holding(chana.slug), body, format='json', **browser.csrf_header())

    assert response.status_code == 403
    assert RecipeList.objects.count() == 0


@pytest.mark.django_db
def test_a_recipe_s_lists_take_the_same_queries_however_many_lists_there_are() -> None:
    milo = milo_with_lists()
    chana = make_recipe(title='Chana masala')
    save_to(milo, chana.slug, 'household', 'sunday-roasts')

    def queries() -> int:
        with CaptureQueriesContext(connection) as captured:
            milo.client.get(holding(chana.slug))
        return len(captured)

    one = queries()
    for name, scope in [('Puddings', 'personal'), ('Soups', 'household'), ('Christmas', 'household')]:
        make(milo, name, scope)
        save_to(milo, chana.slug, scope, name.lower())

    assert queries() == one
