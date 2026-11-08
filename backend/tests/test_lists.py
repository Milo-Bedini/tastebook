from collections.abc import Callable
from typing import Any

import pytest
from django.db import connection
from django.http import HttpResponse
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from households.models import Household, User
from recipe_collections.models import RecipeList, SavedRecipe, Scope
from recipe_collections.services import save_to_list
from recipes.models import Recipe
from tests.test_accounts import BrowserClient
from tests.test_editing_recipes import BEN, CURRY, MILO, ben_in_milos_household, milos_curry, public_curry
from tests.test_household import leave, member, remove, signed_up
from tests.test_recipes import make_recipe
from tests.test_saving_recipes import RESTORE, UNSAVE, save

LISTS = '/api/lists/'
YEAR = timezone.localdate().year


def make(browser: BrowserClient, name: str, scope: str = 'personal') -> HttpResponse:
    return browser.client.post(LISTS, {'name': name, 'scope': scope}, format='json', **browser.csrf_header())


def path(slug: str, scope: str = 'personal') -> str:
    return f'{LISTS}household/{slug}/' if scope == 'household' else f'{LISTS}{slug}/'


def rename(browser: BrowserClient, address: str, name: Any) -> HttpResponse:
    return browser.client.patch(address, {'name': name}, format='json', **browser.csrf_header())


def delete(browser: BrowserClient, address: str) -> HttpResponse:
    return browser.client.delete(address, **browser.csrf_header())


def index(browser: BrowserClient) -> list[tuple[str, str, str]]:
    """Each list on the Lists page as its scope, name and slug."""
    return [(found['scope'], found['name'], found['slug']) for found in browser.client.get(LISTS).json()['lists']]


def titles(browser: BrowserClient, address: str) -> list[tuple[str, str | None]]:
    """Each saved recipe's title as saved, and its recipe's slug, or None when it's unavailable."""
    saved = browser.client.get(address).json()['saved_recipes']
    return [(entry['title'], entry['recipe'] and entry['recipe']['slug']) for entry in saved]


def add(email: str, scope: Scope, slug: str, recipe: Recipe) -> SavedRecipe:
    # Adding to a list from a recipe's page is TAS-125, so the tests add through the service the seed uses.
    return save_to_list(User.objects.get(email=email), scope, slug, recipe)


@pytest.mark.parametrize(
    ('scope', 'address', 'household_name'),
    [
        pytest.param('personal', '/api/lists/weeknight-dinners/', None, id='personal'),
        pytest.param('household', '/api/lists/household/weeknight-dinners/', "Milo's household", id='household'),
    ],
)
@pytest.mark.django_db
def test_making_a_list_answers_it_empty_at_an_address_made_from_its_name(
    scope: str, address: str, household_name: str | None
) -> None:
    milo = signed_up(MILO, 'Milo')

    response = make(milo, '  Weeknight dinners ', scope)

    assert (response.status_code, response.json()) == (
        201,
        {
            'slug': 'weeknight-dinners',
            'name': 'Weeknight dinners',
            'scope': scope,
            'household_name': household_name,
            'saved_recipes': [],
        },
    )
    assert milo.client.get(address).json()['name'] == 'Weeknight dinners'


@pytest.mark.django_db
def test_the_lists_page_shows_favourites_then_your_lists_then_the_household_s_each_by_name() -> None:
    milo = signed_up(MILO, 'Milo')
    for name, scope in [
        ('Weeknight dinners', 'personal'),
        ('Sunday roasts', 'household'),
        ('baking', 'personal'),
        ('Christmas', 'household'),
    ]:
        make(milo, name, scope)

    response = milo.client.get(LISTS)

    assert (response.json()['household_name'], response.json()['household_members']) == ("Milo's household", 1)
    assert index(milo) == [
        ('personal', 'Favourites', 'favourites'),
        ('personal', 'baking', 'baking'),
        ('personal', 'Weeknight dinners', 'weeknight-dinners'),
        ('household', 'Christmas', 'christmas'),
        ('household', 'Sunday roasts', 'sunday-roasts'),
    ]


@pytest.mark.django_db
def test_your_lists_stay_yours_and_the_household_s_are_every_member_s() -> None:
    milo = signed_up(MILO, 'Milo')
    make(milo, 'Weeknight dinners')
    make(milo, 'Sunday roasts', 'household')
    ben = ben_in_milos_household()
    jo = signed_up('jo@example.com', 'Jo')

    assert index(ben) == [('personal', 'Favourites', 'favourites'), ('household', 'Sunday roasts', 'sunday-roasts')]
    assert index(jo) == [('personal', 'Favourites', 'favourites')]
    assert ben.client.get(path('weeknight-dinners')).status_code == 404
    assert ben.client.get(path('sunday-roasts', 'household')).status_code == 200
    assert jo.client.get(path('sunday-roasts', 'household')).status_code == 404


@pytest.mark.django_db
def test_a_list_shows_its_recipes_newest_added_first() -> None:
    milo = signed_up(MILO, 'Milo')
    make(milo, 'Puddings')
    for title in ['Baklava', 'Trifle', 'Eton mess']:
        add(MILO, Scope.PERSONAL, 'puddings', make_recipe(title=title))

    assert titles(milo, path('puddings')) == [('Eton mess', 'eton-mess'), ('Trifle', 'trifle'), ('Baklava', 'baklava')]


@pytest.mark.django_db
def test_the_lists_page_counts_and_fans_each_list_on_its_own() -> None:
    milo = signed_up(MILO, 'Milo')
    make(milo, 'Puddings')
    make(milo, 'Sunday roasts', 'household')
    puddings = [make_recipe(title=title) for title in ['Baklava', 'Trifle', 'Eton mess', 'Jam roly-poly']]
    roast = make_recipe(title='Roast chicken')
    for recipe in puddings:
        add(MILO, Scope.PERSONAL, 'puddings', recipe)
    add(MILO, Scope.HOUSEHOLD, 'sunday-roasts', roast)

    lists = {found['slug']: found for found in milo.client.get(LISTS).json()['lists']}

    assert [lists[slug]['recipe_count'] for slug in ['favourites', 'puddings', 'sunday-roasts']] == [0, 4, 1]
    assert [cover['id'] for cover in lists['puddings']['covers']] == [recipe.pk for recipe in puddings[:0:-1]]
    assert [cover['id'] for cover in lists['sunday-roasts']['covers']] == [roast.pk]


@pytest.mark.django_db
def test_the_lists_page_takes_the_same_queries_however_many_lists_there_are() -> None:
    milo = signed_up(MILO, 'Milo')

    def queries() -> int:
        with CaptureQueriesContext(connection) as captured:
            milo.client.get(LISTS)
        return len(captured)

    make(milo, 'Puddings')
    add(MILO, Scope.PERSONAL, 'puddings', make_recipe(title='Baklava'))
    one = queries()
    for name, scope in [('Roasts', 'household'), ('Soups', 'personal'), ('Christmas', 'household')]:
        make(milo, name, scope)
        add(MILO, Scope(scope), name.lower(), make_recipe(title=f'{name} one'))

    assert queries() == one


def taken(scope: str) -> str:
    who = 'You already have' if scope == 'personal' else "Milo's household already have"
    return f'{who} a list called Christmas. Try another name, like christmas {YEAR}.'


@pytest.mark.parametrize('scope', ['personal', 'household'])
@pytest.mark.parametrize(
    ('name', 'refusal'),
    [
        pytest.param('', 'Give the list a name, like Weeknight dinners.', id='blank'),
        pytest.param('   ', 'Give the list a name, like Weeknight dinners.', id='spaces'),
        pytest.param('a' * 61, 'Ensure this field has no more than 60 characters.', id='61 characters'),
        pytest.param('favourites', 'Favourites is already yours. Try another name.', id='Favourites'),
        pytest.param('christmas', None, id='taken'),
    ],
)
@pytest.mark.django_db
def test_a_name_that_s_missing_too_long_or_taken_is_refused(scope: str, name: str, refusal: str | None) -> None:
    milo = signed_up(MILO, 'Milo')
    make(milo, 'Christmas', scope)

    response = make(milo, name, scope)

    assert (response.status_code, response.json()) == (400, {'name': [refusal or taken(scope)]})
    assert RecipeList.objects.count() == 1


@pytest.mark.django_db
def test_a_list_of_yours_and_one_of_the_household_s_may_share_a_name_and_so_may_two_households() -> None:
    milo = signed_up(MILO, 'Milo')
    jo = signed_up('jo@example.com', 'Jo')

    answers = [make(milo, 'Christmas').status_code, make(milo, 'Christmas', 'household').status_code]
    answers.append(make(jo, 'Christmas', 'household').status_code)

    assert answers == [201, 201, 201]
    assert index(milo)[1:] == [('personal', 'Christmas', 'christmas'), ('household', 'Christmas', 'christmas')]


@pytest.mark.parametrize(
    ('names', 'slug'),
    [
        pytest.param(['Christmas', 'Christmas!'], 'christmas-2', id='same slug as another'),
        pytest.param(['Favourites!'], 'favourites-2', id="Favourites' slug"),
        pytest.param(['!!!'], 'list', id='no letters or digits'),
        pytest.param(['Crème brûlée'], 'creme-brulee', id='accents'),
    ],
)
@pytest.mark.django_db
def test_each_list_gets_an_address_of_its_own(names: list[str], slug: str) -> None:
    milo = signed_up(MILO, 'Milo')

    made = [make(milo, name).json() for name in names]

    assert made[-1]['slug'] == slug
    assert milo.client.get(path(slug)).json()['name'] == names[-1]


@pytest.mark.parametrize('scope', ['personal', 'household'])
@pytest.mark.django_db
def test_renaming_a_list_moves_its_address(scope: str) -> None:
    milo = signed_up(MILO, 'Milo')
    make(milo, 'Weeknight dinners', scope)
    make(milo, 'Christmas', scope)
    add(MILO, Scope(scope), 'weeknight-dinners', make_recipe(title='Bibimbap'))

    response = rename(milo, path('weeknight-dinners', scope), 'Midweek dinners')
    refused = rename(milo, path('midweek-dinners', scope), 'CHRISTMAS')
    same_name = rename(milo, path('midweek-dinners', scope), 'midweek dinners')

    assert (response.status_code, response.json()['slug'], response.json()['name']) == (
        200,
        'midweek-dinners',
        'Midweek dinners',
    )
    assert milo.client.get(path('weeknight-dinners', scope)).status_code == 404
    assert titles(milo, path('midweek-dinners', scope)) == [('Bibimbap', 'bibimbap')]
    assert refused.json() == {'name': [taken(scope).replace('christmas', 'CHRISTMAS')]}
    assert (same_name.status_code, same_name.json()['slug']) == (200, 'midweek-dinners')


@pytest.mark.django_db
def test_favourites_is_never_renamed_or_deleted() -> None:
    milo = signed_up(MILO, 'Milo')
    save(milo, make_recipe(title='Baklava').slug)

    renamed = rename(milo, path('favourites'), 'Loved')
    deleted = delete(milo, path('favourites'))

    assert (renamed.status_code, deleted.status_code) == (404, 404)
    assert index(milo) == [('personal', 'Favourites', 'favourites')]
    assert titles(milo, path('favourites')) == [('Baklava', 'baklava')]


@pytest.mark.django_db
def test_deleting_a_list_keeps_its_recipes() -> None:
    milo = signed_up(MILO, 'Milo')
    make(milo, 'Puddings')
    baklava = make_recipe(title='Baklava')
    add(MILO, Scope.PERSONAL, 'puddings', baklava)
    save(milo, baklava.slug)

    response = delete(milo, path('puddings'))

    assert response.status_code == 204
    assert index(milo) == [('personal', 'Favourites', 'favourites')]
    assert Recipe.objects.filter(pk=baklava.pk).exists()
    assert titles(milo, path('favourites')) == [('Baklava', 'baklava')]
    assert delete(milo, path('puddings')).status_code == 404


@pytest.mark.django_db
def test_any_member_renames_deletes_and_removes_from_a_household_list() -> None:
    milo = signed_up(MILO, 'Milo')
    make(milo, 'Sunday roasts', 'household')
    make(milo, 'Christmas', 'household')
    saved = add(MILO, Scope.HOUSEHOLD, 'sunday-roasts', make_recipe(title='Roast chicken'))
    ben = ben_in_milos_household()

    renamed = rename(ben, path('sunday-roasts', 'household'), 'Roasts')
    removed = ben.client.delete(f'{UNSAVE}{saved.pk}/', **ben.csrf_header())
    deleted = delete(ben, path('christmas', 'household'))

    assert (renamed.status_code, removed.status_code, deleted.status_code) == (200, 200, 204)
    assert index(milo)[1:] == [('household', 'Roasts', 'roasts')]
    assert titles(milo, path('roasts', 'household')) == []
    # Undo puts it back for everyone in the household.
    restored = ben.client.post(RESTORE, {'undo': removed.json()['undo']}, format='json', **ben.csrf_header())
    assert restored.status_code == 201
    assert titles(milo, path('roasts', 'household')) == [('Roast chicken', 'roast-chicken')]


@pytest.mark.parametrize(
    ('method', 'body'),
    [pytest.param('get', None), pytest.param('patch', {'name': 'Mine now'}), pytest.param('delete', None)],
)
@pytest.mark.django_db
def test_nobody_else_reaches_your_lists_or_another_household_s(method: str, body: dict[str, str] | None) -> None:
    milo = signed_up(MILO, 'Milo')
    make(milo, 'Weeknight dinners')
    make(milo, 'Sunday roasts', 'household')
    ben = ben_in_milos_household()
    jo = signed_up('jo@example.com', 'Jo')

    answers = [
        getattr(caller.client, method)(address, body, format='json', **caller.csrf_header()).status_code
        for caller, address in [
            (ben, path('weeknight-dinners')),
            (jo, path('weeknight-dinners')),
            (jo, path('sunday-roasts', 'household')),
        ]
    ]

    assert answers == [404, 404, 404]
    assert index(milo)[1:] == [
        ('personal', 'Weeknight dinners', 'weeknight-dinners'),
        ('household', 'Sunday roasts', 'sunday-roasts'),
    ]


@pytest.mark.django_db
def test_nobody_outside_the_household_removes_from_its_lists() -> None:
    milo = signed_up(MILO, 'Milo')
    make(milo, 'Sunday roasts', 'household')
    saved = add(MILO, Scope.HOUSEHOLD, 'sunday-roasts', make_recipe(title='Roast chicken'))
    jo = signed_up('jo@example.com', 'Jo')

    response = jo.client.delete(f'{UNSAVE}{saved.pk}/', **jo.csrf_header())

    assert response.status_code == 404
    assert titles(milo, path('sunday-roasts', 'household')) == [('Roast chicken', 'roast-chicken')]


def left(ben: BrowserClient, milo: BrowserClient) -> None:
    leave(ben)


def removed(ben: BrowserClient, milo: BrowserClient) -> None:
    remove(milo, member(BEN))


@pytest.mark.parametrize('moved', [pytest.param(left, id='leaving'), pytest.param(removed, id='removed')])
@pytest.mark.django_db
def test_moving_out_keeps_your_lists_minus_the_old_household_s_private_recipes(
    moved: Callable[[BrowserClient, BrowserClient], None],
) -> None:
    milo, curry = milos_curry()
    ben = ben_in_milos_household()
    stew = ben.client.post('/api/recipes/', {'title': "Ben's stew"}, format='json', **ben.csrf_header()).json()
    baklava = make_recipe(title='Baklava')
    make(ben, 'Weeknight dinners')
    make(ben, 'Sunday roasts', 'household')
    for slug in [curry, stew['slug'], baklava.slug]:
        recipe = Recipe.objects.get(slug=slug)
        save(ben, slug)
        add(BEN, Scope.PERSONAL, 'weeknight-dinners', recipe)
        add(BEN, Scope.HOUSEHOLD, 'sunday-roasts', recipe)

    moved(ben, milo)

    # Ben takes a copy of his stew; the one saved is the household's, which he no longer sees.
    assert titles(ben, path('favourites')) == [('Baklava', 'baklava')]
    assert titles(ben, path('weeknight-dinners')) == [('Baklava', 'baklava')]
    assert index(ben) == [
        ('personal', 'Favourites', 'favourites'),
        ('personal', 'Weeknight dinners', 'weeknight-dinners'),
    ]
    assert [title for title, _ in titles(milo, path('sunday-roasts', 'household'))] == ['Baklava', "Ben's stew", CURRY]


@pytest.mark.django_db
def test_the_last_member_leaving_takes_the_household_s_lists_with_it() -> None:
    milo = signed_up(MILO, 'Milo')
    make(milo, 'Sunday roasts', 'household')
    household = User.objects.get(email=MILO).household_id

    leave(milo)

    assert not Household.objects.filter(pk=household).exists()
    assert RecipeList.objects.filter(household_id=household).count() == 0


@pytest.mark.django_db
def test_a_recipe_in_a_household_list_counts_every_member_who_would_find_it_gone() -> None:
    milo, slug = public_curry()
    jo = signed_up('jo@example.com', 'Jo')
    signed_up('sam@example.com', 'Sam')
    User.objects.filter(email='sam@example.com').update(household=User.objects.get(email='jo@example.com').household)
    make(jo, 'Curries', 'household')
    add('jo@example.com', Scope.HOUSEHOLD, 'curries', Recipe.objects.get(slug=slug))
    save(jo, slug)

    assert milo.client.get(f'/api/recipes/{slug}/').json()['save_count'] == 2


@pytest.mark.parametrize(
    ('method', 'address', 'body'),
    [
        pytest.param('post', LISTS, {'name': 'Puddings', 'scope': 'personal'}, id='POST lists'),
        pytest.param('get', '/api/lists/puddings/', None, id='GET a list'),
        pytest.param('patch', '/api/lists/puddings/', {'name': 'Afters'}, id='PATCH a list'),
        pytest.param('delete', '/api/lists/household/puddings/', None, id='DELETE a household list'),
    ],
)
@pytest.mark.django_db
def test_signed_out_no_list_is_made_seen_or_changed(method: str, address: str, body: dict[str, str] | None) -> None:
    browser = BrowserClient()

    response = getattr(browser.client, method)(address, body, format='json', **browser.csrf_header())

    assert response.status_code == 403
    assert RecipeList.objects.count() == 0
