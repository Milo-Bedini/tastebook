from collections.abc import Callable
from typing import Any

import pytest
from django.http import HttpResponse

from households.models import User
from recipes.models import IngredientGroup, IngredientLine, Recipe, Step
from tests.test_accounts import BrowserClient, sign_up
from tests.test_household import join, signed_up
from tests.test_recipes import add_line, make_recipe

RECIPES = '/api/recipes/'
MILO = 'milo@example.com'
BEN = 'ben@example.com'
CURRY = "Grandma's curry"


def add(browser: BrowserClient, body: dict[str, Any]) -> str:
    return browser.client.post(RECIPES, body, format='json', **browser.csrf_header()).json()['slug']


def change(browser: BrowserClient, slug: str, body: dict[str, Any]) -> HttpResponse:
    return browser.client.patch(f'{RECIPES}{slug}/', body, format='json', **browser.csrf_header())


def milos_curry(**details: Any) -> tuple[BrowserClient, str]:
    milo = signed_up(MILO, 'Milo')
    return milo, add(milo, {'title': CURRY, 'cuisines': ['italian'], **details})


def ben_in_milos_household() -> BrowserClient:
    ben = signed_up(BEN, 'Ben')
    join(BEN, MILO)
    return ben


def complete_curry() -> tuple[BrowserClient, str]:
    """Milo's curry with two lines, two steps, prep 15, cook 30 and serves 4: everything a public recipe needs."""
    milo, slug = milos_curry(prep_minutes=15, cook_minutes=30, servings=4)
    curry = Recipe.objects.get(slug=slug)
    add_line(curry, 'onion')
    add_line(curry, 'tomato', group=IngredientGroup.objects.create(recipe=curry, name='For the sauce'))
    Step.objects.create(recipe=curry, position=0, text='Fry the onions.')
    Step.objects.create(recipe=curry, position=1, text='Add the tomatoes.')
    return milo, slug


def public_curry() -> tuple[BrowserClient, str]:
    milo, slug = complete_curry()
    Recipe.objects.filter(slug=slug).update(visibility='public')
    return milo, slug


def title_of(slug: str) -> str:
    return Recipe.objects.get(slug=slug).title


EVERY_DETAIL: dict[str, Any] = {
    'title': 'Lamb curry',
    'description': 'Slow and rich.',
    'cuisines': ['french'],
    'courses': ['main'],
    'difficulty': 'medium',
    'prep_minutes': 15,
    'cook_minutes': 30,
    'extra_minutes': 60,
    'extra_label': 'marinating',
    'servings': None,
    'yield_amount': 12,
    'yield_unit': 'flatbreads',
    'one_pot': True,
    'source': "Nonna's notebook",
    'source_url': 'https://example.com/lamb-curry',
}


@pytest.mark.django_db
def test_a_member_edits_a_recipe_another_member_wrote() -> None:
    _, slug = milos_curry()
    ben = ben_in_milos_household()

    response = change(ben, slug, EVERY_DETAIL)

    body = response.json()
    assert response.status_code == 200
    assert {key: body[key] for key in [*EVERY_DETAIL, 'slug', 'total_minutes']} == {
        **EVERY_DETAIL,
        'cuisines': [{'slug': 'french', 'name': 'French'}],
        'courses': [{'slug': 'main', 'name': 'Main'}],
        'slug': slug,
        'total_minutes': 105,
    }
    assert Recipe.objects.get(slug=slug).created_by == User.objects.get(email=MILO)


@pytest.mark.django_db
def test_a_new_title_keeps_the_recipes_address() -> None:
    milo, slug = milos_curry()

    change(milo, slug, {'title': 'Lamb curry'})

    response = milo.client.get(f'{RECIPES}{slug}/')
    assert (response.status_code, response.json()['title']) == (200, 'Lamb curry')


@pytest.mark.django_db
def test_a_field_left_out_is_kept() -> None:
    milo, slug = milos_curry()

    response = change(milo, slug, {'description': 'Mild.'})

    body = response.json()
    assert (body['description'], body['title'], body['cuisines']) == (
        'Mild.',
        CURRY,
        [{'slug': 'italian', 'name': 'Italian'}],
    )


@pytest.mark.django_db
def test_an_empty_list_and_a_null_clear_what_they_name() -> None:
    milo, slug = milos_curry(prep_minutes=20)

    response = change(milo, slug, {'cuisines': [], 'prep_minutes': None})

    body = response.json()
    assert (response.status_code, body['cuisines'], body['prep_minutes']) == (200, [], None)


BLANK_TITLE = "Give the recipe a title, like Grandma's curry."
BOTH = 'Give servings or a yield with its unit, not both.'


@pytest.mark.django_db
@pytest.mark.parametrize(
    ('body', 'key', 'message'),
    [
        ({'title': ''}, 'title', BLANK_TITLE),
        ({'title': '   '}, 'title', BLANK_TITLE),
        ({'title': 'a' * 201}, 'title', 'Ensure this field has no more than 200 characters.'),
        ({'cuisines': ['atlantean']}, 'cuisines', 'Object with slug=atlantean does not exist.'),
        ({'difficulty': 'tricky'}, 'difficulty', '"tricky" is not a valid choice.'),
        ({'prep_minutes': -1}, 'prep_minutes', 'Ensure this value is greater than or equal to 0.'),
        ({'servings': 4, 'yield_amount': 12, 'yield_unit': 'cookies'}, 'non_field_errors', BOTH),
        (
            {'extra_minutes': 30, 'extra_label': ''},
            'non_field_errors',
            'Give extra time with its label (marinating, resting, proving), or neither.',
        ),
    ],
)
def test_an_edit_the_recipe_cant_hold_is_refused(body: dict[str, Any], key: str, message: str) -> None:
    milo, slug = milos_curry()

    response = change(milo, slug, body)

    assert (response.status_code, response.json()[key]) == (400, [message])
    assert title_of(slug) == CURRY


@pytest.mark.django_db
@pytest.mark.parametrize('body', ['ingredient_lines', 42, ['ingredient_lines'], []])
def test_an_edit_that_isnt_a_json_object_is_refused(body: object) -> None:
    milo, slug = milos_curry()

    response = milo.client.patch(f'{RECIPES}{slug}/', body, format='json', **milo.csrf_header())

    assert (response.status_code, response.json()) == (
        400,
        {'non_field_errors': ['Send the changes as a JSON object.']},
    )
    assert title_of(slug) == CURRY


def signed_out(slug: str) -> HttpResponse:
    return change(BrowserClient(), slug, {'title': 'Taken'})


def without_the_csrf_header(slug: str) -> HttpResponse:
    ben = ben_in_milos_household()
    return ben.client.patch(f'{RECIPES}{slug}/', {'title': 'Taken'}, format='json')


def with_no_name_yet(slug: str) -> HttpResponse:
    browser = BrowserClient()
    sign_up(browser, BEN)
    return change(browser, slug, {'title': 'Taken'})


def from_another_household(slug: str) -> HttpResponse:
    return change(signed_up(BEN, 'Ben'), slug, {'title': 'Taken'})


@pytest.mark.django_db
@pytest.mark.parametrize(
    ('attempt', 'status'),
    [
        pytest.param(signed_out, 403, id='signed out'),
        pytest.param(without_the_csrf_header, 403, id='without the CSRF header'),
        pytest.param(with_no_name_yet, 403, id='with no household yet'),
        pytest.param(from_another_household, 404, id='a member of another household'),
    ],
)
def test_only_its_household_can_edit_a_recipe(attempt: Callable[[str], HttpResponse], status: int) -> None:
    _, slug = milos_curry()

    response = attempt(slug)

    assert response.status_code == status
    assert title_of(slug) == CURRY


@pytest.mark.django_db
def test_a_catalogue_recipe_cant_be_edited() -> None:
    make_recipe(title='Apple tart', slug='apple-tart')
    milo = signed_up(MILO, 'Milo')

    response = change(milo, 'apple-tart', {'title': 'Taken'})

    assert response.status_code == 404
    assert title_of('apple-tart') == 'Apple tart'


@pytest.mark.django_db
def test_when_two_members_save_the_last_save_wins() -> None:
    milo, slug = milos_curry(cook_minutes=30)
    ben = ben_in_milos_household()
    loaded = ben.client.get(f'{RECIPES}{slug}/').json()
    milo.client.get(f'{RECIPES}{slug}/')

    first = change(milo, slug, {'title': "Milo's curry"})
    second = change(
        ben,
        slug,
        {
            **{key: loaded[key] for key in EVERY_DETAIL},
            'title': "Ben's curry",
            'cuisines': [cuisine['slug'] for cuisine in loaded['cuisines']],
            'courses': [course['slug'] for course in loaded['courses']],
            'cook_minutes': 40,
        },
    )

    body = milo.client.get(f'{RECIPES}{slug}/').json()
    assert (first.status_code, second.status_code) == (200, 200)
    assert (body['title'], body['cook_minutes']) == ("Ben's curry", 40)


@pytest.mark.django_db
def test_another_member_cant_edit_a_public_recipe() -> None:
    _, slug = public_curry()
    ben = ben_in_milos_household()

    response = change(ben, slug, {'title': 'Taken'})

    assert response.status_code == 404
    assert title_of(slug) == CURRY


@pytest.mark.django_db
def test_the_author_edits_their_public_recipe() -> None:
    milo, slug = public_curry()

    response = change(milo, slug, {'title': 'Lamb curry'})

    assert (response.status_code, response.json()['title'], title_of(slug)) == (200, 'Lamb curry', 'Lamb curry')


def what_publishing_needs(slug: str) -> tuple[Any, ...]:
    recipe = Recipe.objects.get(slug=slug)
    return (
        IngredientLine.objects.filter(recipe=recipe).count(),
        IngredientGroup.objects.filter(recipe=recipe).count(),
        list(Step.objects.filter(recipe=recipe).values_list('text', flat=True)),
        recipe.prep_minutes,
        recipe.cook_minutes,
        recipe.servings,
    )


AS_PUBLISHED = (2, 1, ['Fry the onions.', 'Add the tomatoes.'], 15, 30, 4)

GAP_LEFT_BY = [
    pytest.param({'steps': []}, 'a method', id='no steps'),
    pytest.param({'ingredient_lines': [], 'ingredient_groups': []}, 'ingredients', id='no ingredients'),
    pytest.param({'cook_minutes': None}, 'a cook time', id='no cook time'),
    pytest.param({'servings': None}, 'servings or a yield', id='no servings'),
]


@pytest.mark.django_db
@pytest.mark.parametrize(('body', 'gap'), GAP_LEFT_BY)
def test_an_edit_leaving_a_public_recipe_missing_something_is_refused(body: dict[str, Any], gap: str) -> None:
    milo, slug = public_curry()

    response = change(milo, slug, {**body, 'title': 'Lamb curry'})

    assert (response.status_code, response.json()) == (
        400,
        {'non_field_errors': [f"A public recipe needs {gap}, so these changes can't be saved. Make it private first."]},
    )
    assert (title_of(slug), what_publishing_needs(slug)) == (CURRY, AS_PUBLISHED)


@pytest.mark.django_db
@pytest.mark.parametrize(('body', 'gap'), GAP_LEFT_BY)
def test_the_same_edit_to_a_private_recipe_is_saved(body: dict[str, Any], gap: str) -> None:
    milo, slug = complete_curry()

    response = change(milo, slug, body)

    assert response.status_code == 200
    assert what_publishing_needs(slug) != AS_PUBLISHED
