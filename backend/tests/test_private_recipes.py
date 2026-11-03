import re
from collections.abc import Callable
from typing import Any

import pytest
from django.http import HttpResponse

from households.models import User
from recipes.models import Cuisine, Recipe
from tests.test_accounts import BrowserClient, sign_up
from tests.test_household import join, signed_up
from tests.test_recipes import make_recipe

RECIPES = '/api/recipes/'
MILO = 'milo@example.com'


def add(browser: BrowserClient, body: dict[str, Any]) -> HttpResponse:
    return browser.client.post(RECIPES, body, format='json', **browser.csrf_header())


def titles(browser: BrowserClient, query: str = '') -> list[str]:
    return [recipe['title'] for recipe in browser.client.get(f'{RECIPES}{query}').json()]


@pytest.mark.django_db
def test_a_member_adds_a_recipe_with_only_a_title() -> None:
    milo = signed_up(MILO, 'Milo')

    response = add(milo, {'title': "Grandma's curry"})

    body = response.json()
    assert response.status_code == 201
    assert (
        body['visibility'],
        body['difficulty'],
        body['total_minutes'],
        body['prep_minutes'],
        body['servings'],
        body['cuisines'],
    ) == ('private', '', None, None, None, [])
    assert re.fullmatch(r'grandmas-curry-[a-hjkmnp-z2-9]{6}', body['slug'])
    recipe = Recipe.objects.get(slug=body['slug'])
    account = User.objects.get(email=MILO)
    assert (recipe.household_id, recipe.created_by) == (account.household_id, account)


@pytest.mark.django_db
def test_a_member_adds_a_recipe_with_every_detail() -> None:
    milo = signed_up(MILO, 'Milo')

    response = add(
        milo,
        {
            'title': 'Flatbreads',
            'description': 'Soft and blistered.',
            'cuisines': ['italian'],
            'courses': ['main'],
            'difficulty': 'medium',
            'prep_minutes': 15,
            'cook_minutes': 30,
            'extra_minutes': 60,
            'extra_label': 'marinating',
            'yield_amount': 12,
            'yield_unit': 'flatbreads',
            'one_pot': True,
            'source': "Nonna's notebook",
            'source_url': 'https://example.com/flatbreads',
        },
    )

    body = response.json()
    assert response.status_code == 201
    assert {
        key: body[key]
        for key in [
            'title',
            'description',
            'cuisines',
            'courses',
            'difficulty',
            'prep_minutes',
            'cook_minutes',
            'extra_minutes',
            'extra_label',
            'total_minutes',
            'servings',
            'yield_amount',
            'yield_unit',
            'one_pot',
            'source',
            'source_url',
        ]
    } == {
        'title': 'Flatbreads',
        'description': 'Soft and blistered.',
        'cuisines': [{'slug': 'italian', 'name': 'Italian'}],
        'courses': [{'slug': 'main', 'name': 'Main'}],
        'difficulty': 'medium',
        'prep_minutes': 15,
        'cook_minutes': 30,
        'extra_minutes': 60,
        'extra_label': 'marinating',
        'total_minutes': 105,
        'servings': None,
        'yield_amount': 12,
        'yield_unit': 'flatbreads',
        'one_pot': True,
        'source': "Nonna's notebook",
        'source_url': 'https://example.com/flatbreads',
    }


@pytest.mark.django_db
def test_two_recipes_with_one_title_get_addresses_that_say_nothing_of_each_other() -> None:
    milo = signed_up(MILO, 'Milo')

    slugs = [add(milo, {'title': "Grandma's curry"}).json()['slug'] for _ in range(2)]

    assert len(set(slugs)) == 2
    assert set(slugs) & {'grandmas-curry', 'grandmas-curry-2'} == set()


BOTH = 'Give servings or a yield with its unit, not both.'


@pytest.mark.django_db
@pytest.mark.parametrize(
    ('body', 'key', 'message'),
    [
        ({}, 'title', "Give the recipe a title, like Grandma's curry."),
        ({'title': '   '}, 'title', "Give the recipe a title, like Grandma's curry."),
        ({'title': 'a' * 201}, 'title', 'Ensure this field has no more than 200 characters.'),
        ({'title': 'Stew', 'cuisines': ['atlantean']}, 'cuisines', 'Object with slug=atlantean does not exist.'),
        ({'title': 'Stew', 'difficulty': 'tricky'}, 'difficulty', '"tricky" is not a valid choice.'),
        ({'title': 'Stew', 'prep_minutes': -1}, 'prep_minutes', 'Ensure this value is greater than or equal to 0.'),
        ({'title': 'Stew', 'servings': 4, 'yield_amount': 12, 'yield_unit': 'cookies'}, 'non_field_errors', BOTH),
        ({'title': 'Stew', 'yield_amount': 12}, 'non_field_errors', BOTH),
        (
            {'title': 'Stew', 'extra_minutes': 30},
            'non_field_errors',
            'Give extra time with its label (marinating, resting, proving), or neither.',
        ),
    ],
)
def test_a_recipe_the_household_cant_hold_is_refused(body: dict[str, Any], key: str, message: str) -> None:
    milo = signed_up(MILO, 'Milo')

    response = add(milo, body)

    assert (response.status_code, response.json()[key]) == (400, [message])
    assert Recipe.objects.count() == 0


def signed_out() -> HttpResponse:
    return add(BrowserClient(), {'title': 'Stew'})


def without_the_csrf_header() -> HttpResponse:
    milo = signed_up(MILO, 'Milo')
    return milo.client.post(RECIPES, {'title': 'Stew'}, format='json')


def with_no_name_yet() -> HttpResponse:
    browser = BrowserClient()
    sign_up(browser, MILO)
    return add(browser, {'title': 'Stew'})


@pytest.mark.django_db
@pytest.mark.parametrize(
    'attempt',
    [
        pytest.param(signed_out, id='signed out'),
        pytest.param(without_the_csrf_header, id='without the CSRF header'),
        pytest.param(with_no_name_yet, id='with no household yet'),
    ],
)
def test_adding_a_recipe_needs_a_member_of_a_household(attempt: Callable[[], HttpResponse]) -> None:
    response = attempt()

    assert response.status_code == 403
    assert Recipe.objects.count() == 0


CATALOGUE_ONLY = ['Apple tart']
WITH_THE_CURRY = ['Apple tart', "Grandma's curry"]


def stranger() -> BrowserClient:
    return BrowserClient()


def another_household() -> BrowserClient:
    return signed_up('jo@example.com', 'Jo')


def another_member() -> BrowserClient:
    philippa = signed_up('philippa@example.com', 'Philippa')
    join('philippa@example.com', MILO)
    return philippa


def its_author() -> BrowserClient:
    milo = BrowserClient()
    milo.client.force_login(User.objects.get(email=MILO))
    return milo


# Search lists title matches first, so the curry comes before the tart whose description names curry leaves.
CURRY_FIRST = ["Grandma's curry", 'Apple tart']


@pytest.mark.django_db
@pytest.mark.parametrize(
    ('viewer', 'listed', 'searched', 'page'),
    [
        pytest.param(stranger, CATALOGUE_ONLY, CATALOGUE_ONLY, 404, id='signed out'),
        pytest.param(another_household, CATALOGUE_ONLY, CATALOGUE_ONLY, 404, id='another household'),
        pytest.param(another_member, WITH_THE_CURRY, CURRY_FIRST, 200, id='another member of its household'),
        pytest.param(its_author, WITH_THE_CURRY, CURRY_FIRST, 200, id='its author'),
    ],
)
def test_only_its_household_finds_a_private_recipe(
    viewer: Callable[[], BrowserClient], listed: list[str], searched: list[str], page: int
) -> None:
    make_recipe(title='Apple tart', description='With curry leaves.')
    slug = add(signed_up(MILO, 'Milo'), {'title': "Grandma's curry"}).json()['slug']
    browser = viewer()

    response = browser.client.get(f'{RECIPES}{slug}/')

    assert (titles(browser), titles(browser, '?q=curry')) == (listed, searched)
    assert response.status_code == page
    assert ("Grandma's curry" in response.content.decode()) == (page == 200)


@pytest.mark.django_db
def test_a_members_list_says_which_recipes_are_private() -> None:
    make_recipe(title='Apple tart')
    milo = signed_up(MILO, 'Milo')
    add(milo, {'title': "Grandma's curry"})

    body = milo.client.get(RECIPES).json()

    assert [(recipe['title'], recipe['visibility']) for recipe in body] == [
        ('Apple tart', 'public'),
        ("Grandma's curry", 'private'),
    ]


@pytest.mark.django_db
@pytest.mark.parametrize(
    ('query', 'expected'),
    [
        ('', WITH_THE_CURRY),
        ('?cuisine=italian', WITH_THE_CURRY),
        ('?max_prep=60', CATALOGUE_ONLY),
        ('?max_total=600', CATALOGUE_ONLY),
        ('?difficulty=easy', CATALOGUE_ONLY),
    ],
)
def test_a_filter_leaves_out_a_private_recipe_missing_what_it_filters_on(query: str, expected: list[str]) -> None:
    make_recipe(title='Apple tart').cuisines.set(Cuisine.objects.filter(slug='italian'))
    milo = signed_up(MILO, 'Milo')
    add(milo, {'title': "Grandma's curry", 'cuisines': ['italian']})

    assert titles(milo, query) == expected
