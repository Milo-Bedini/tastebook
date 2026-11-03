from typing import Any

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from recipes.models import IngredientLine, Recipe
from tests.test_added_ingredients import line
from tests.test_editing_recipes import RECIPES, ben_in_milos_household, change, milos_curry
from tests.test_household import signed_up
from tests.test_recipes import ingredient

ONION = line('onion', amount=1)
OLIVE_OIL = line('olive-oil', amount=2, amount_max=3, unit='tbsp', optional=True, note='extra virgin')
GARLIC = line('garlic', amount=2, unit='clove')
SAUCE = {'name': 'For the sauce', 'lines': [GARLIC]}


def shown(sent: dict[str, Any], name: str) -> dict[str, Any]:
    """A line as the API answers it: the line sent, with its ingredient in full."""
    return {
        **sent,
        'ingredient': {'slug': sent['ingredient'], 'name': name, 'grams_per_cup': None, 'awaiting_review': False},
    }


def without_ids(lines: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [{key: value for key, value in row.items() if key != 'id'} for row in lines]


def ingredients_of(body: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    groups = [{'name': group['name'], 'lines': without_ids(group['lines'])} for group in body['ingredient_groups']]
    return without_ids(body['ingredient_lines']), groups


@pytest.fixture
def pantry() -> None:
    for name in ['onion', 'olive oil', 'garlic']:
        ingredient(name)


@pytest.mark.django_db
@pytest.mark.usefixtures('pantry')
def test_a_member_adds_a_recipe_with_lines_above_the_groups_and_a_group() -> None:
    milo = signed_up('milo@example.com', 'Milo')

    response = milo.client.post(
        RECIPES,
        {'title': 'Garlic onions', 'ingredient_lines': [ONION, OLIVE_OIL], 'ingredient_groups': [SAUCE]},
        format='json',
        **milo.csrf_header(),
    )

    assert response.status_code == 201
    assert ingredients_of(response.json()) == (
        [shown(ONION, 'onion'), shown(OLIVE_OIL, 'olive oil')],
        [{'name': 'For the sauce', 'lines': [shown(GARLIC, 'garlic')]}],
    )


@pytest.mark.django_db
@pytest.mark.usefixtures('pantry')
def test_sending_only_the_lines_replaces_every_line_and_group() -> None:
    _, slug = milos_curry(ingredient_lines=[ONION], ingredient_groups=[SAUCE])
    ben = ben_in_milos_household()

    response = change(ben, slug, {'ingredient_lines': [GARLIC]})

    assert response.status_code == 200
    assert ingredients_of(response.json()) == ([shown(GARLIC, 'garlic')], [])


@pytest.mark.django_db
@pytest.mark.usefixtures('pantry')
def test_an_edit_that_sends_neither_keeps_the_ingredients() -> None:
    milo, slug = milos_curry(ingredient_lines=[ONION], ingredient_groups=[SAUCE])

    response = change(milo, slug, {'title': 'Lamb curry'})

    assert ingredients_of(response.json()) == (
        [shown(ONION, 'onion')],
        [{'name': 'For the sauce', 'lines': [shown(GARLIC, 'garlic')]}],
    )


@pytest.mark.django_db
@pytest.mark.usefixtures('pantry')
def test_sending_both_empty_removes_every_line_and_group() -> None:
    milo, slug = milos_curry(ingredient_lines=[ONION], ingredient_groups=[SAUCE])

    response = change(milo, slug, {'ingredient_lines': [], 'ingredient_groups': []})

    assert ingredients_of(response.json()) == ([], [])
    assert IngredientLine.objects.filter(recipe__slug=slug).count() == 0


@pytest.mark.django_db
@pytest.mark.usefixtures('pantry')
@pytest.mark.parametrize(
    ('body', 'errors'),
    [
        (
            {'ingredient_lines': [line('atlantean-salt')]},
            {'ingredient_lines': {'0': {'ingredient': ['Object with slug=atlantean-salt does not exist.']}}},
        ),
        (
            {'ingredient_lines': [line('onion', amount=0)]},
            {'ingredient_lines': {'0': {'amount': ['Give an amount above 0, or leave it empty.']}}},
        ),
        (
            {'ingredient_lines': [line('onion', amount=3, amount_max=2)]},
            {
                'ingredient_lines': {
                    '0': {'amount_max': ['Give a range with its lower amount first, such as 2 up to 3.']}
                }
            },
        ),
        (
            {'ingredient_lines': [line('onion', unit='bucket')]},
            {'ingredient_lines': {'0': {'unit': ['"bucket" is not a valid choice.']}}},
        ),
        (
            {'ingredient_groups': [{'name': '  ', 'lines': []}]},
            {'ingredient_groups': {'0': {'name': ['Give the group a name, like For the sauce.']}}},
        ),
        (
            {'ingredient_lines': [ONION] * 101},
            {'ingredient_lines': {'non_field_errors': ['Ensure this field has no more than 100 elements.']}},
        ),
    ],
    ids=['unknown ingredient', 'amount 0', 'falling range', 'unknown unit', 'blank group name', '101 lines'],
)
def test_ingredients_the_recipe_cant_hold_are_refused(body: dict[str, Any], errors: dict[str, Any]) -> None:
    milo, slug = milos_curry(ingredient_lines=[ONION])

    response = change(milo, slug, body)

    assert (response.status_code, response.json()) == (400, errors)
    assert list(IngredientLine.objects.filter(recipe__slug=slug).values_list('ingredient__slug', flat=True)) == [
        'onion'
    ]


@pytest.mark.django_db
@pytest.mark.usefixtures('pantry')
def test_saving_thirty_lines_takes_as_many_queries_as_two() -> None:
    milo = signed_up('milo@example.com', 'Milo')

    def queries_to_add(body: dict[str, Any]) -> int:
        with CaptureQueriesContext(connection) as queries:
            response = milo.client.post(RECIPES, {'title': 'Soup', **body}, format='json', **milo.csrf_header())
        assert response.status_code == 201
        return len(queries)

    # Each has a group, as making groups and fetching their lines back are a query each, however many.
    two = queries_to_add({'ingredient_lines': [ONION], 'ingredient_groups': [SAUCE]})
    thirty = queries_to_add(
        {'ingredient_groups': [{'name': f'Part {part}', 'lines': [ONION, GARLIC] * 5} for part in range(3)]}
    )

    assert thirty == two
    assert Recipe.objects.filter(title='Soup').count() == 2
