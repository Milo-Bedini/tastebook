from typing import Any

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from rest_framework.test import APIClient

from recipes.models import Recipe
from tests.test_editing_recipes import CURRY, RECIPES, ben_in_milos_household, change, milos_curry
from tests.test_household import signed_up

FRY = 'Fry the onion until soft and golden.'
SIMMER = 'Add the tomatoes and simmer for 20 minutes.'
SERVE = 'Serve with rice.'
HOB = {'slug': 'hob', 'name': 'Hob'}
OVEN = {'slug': 'oven', 'name': 'Oven'}


def method_of(body: dict[str, Any]) -> tuple[list[str], list[dict[str, str]]]:
    return [step['text'] for step in body['steps']], body['equipment']


@pytest.mark.django_db
def test_lists_the_seeded_equipment_alphabetically() -> None:
    response = APIClient().get(reverse('equipment-list'))

    assert response.status_code == 200
    assert [equipment['name'] for equipment in response.json()] == [
        'Air fryer',
        'Blender',
        'Food processor',
        'Grill',
        'Hand mixer',
        'Hob',
        'Microwave',
        'Oven',
        'Pressure cooker',
        'Slow cooker',
        'Stand mixer',
    ]
    assert response.json()[0] == {'slug': 'air-fryer', 'name': 'Air fryer'}


@pytest.mark.django_db
def test_a_member_adds_a_recipe_with_its_method_and_equipment() -> None:
    milo = signed_up('milo@example.com', 'Milo')

    response = milo.client.post(
        RECIPES,
        {'title': CURRY, 'steps': [FRY, f'  {SIMMER}\nStir now and then. '], 'equipment': ['oven', 'hob']},
        format='json',
        **milo.csrf_header(),
    )

    assert response.status_code == 201
    assert method_of(response.json()) == ([FRY, f'{SIMMER}\nStir now and then.'], [HOB, OVEN])


@pytest.mark.django_db
def test_sending_the_steps_replaces_them_in_the_order_sent() -> None:
    _, slug = milos_curry(steps=[FRY, SIMMER], equipment=['hob'])
    ben = ben_in_milos_household()

    response = change(ben, slug, {'steps': [SERVE, FRY], 'equipment': ['oven']})

    assert response.status_code == 200
    assert method_of(response.json()) == ([SERVE, FRY], [OVEN])
    assert method_of(ben.client.get(f'{RECIPES}{slug}/').json()) == ([SERVE, FRY], [OVEN])


@pytest.mark.django_db
def test_an_edit_that_leaves_them_out_keeps_the_steps_and_equipment() -> None:
    milo, slug = milos_curry(steps=[FRY, SIMMER], equipment=['hob'])

    response = change(milo, slug, {'title': 'Lamb curry'})

    assert method_of(response.json()) == ([FRY, SIMMER], [HOB])


@pytest.mark.django_db
def test_empty_lists_clear_the_steps_and_equipment() -> None:
    milo, slug = milos_curry(steps=[FRY], equipment=['hob'])

    response = change(milo, slug, {'steps': [], 'equipment': []})

    assert (response.status_code, method_of(response.json())) == (200, ([], []))


@pytest.mark.django_db
def test_saving_thirty_steps_takes_as_many_queries_as_two() -> None:
    milo, slug = milos_curry()

    def queries_to_save(steps: list[str]) -> int:
        with CaptureQueriesContext(connection) as queries:
            change(milo, slug, {'steps': steps})
        return len(queries)

    assert queries_to_save([FRY] * 30) == queries_to_save([FRY, SIMMER])


@pytest.mark.django_db
@pytest.mark.parametrize(
    ('body', 'refused'),
    [
        pytest.param(
            {'steps': [FRY, '   ', SERVE]},
            {'steps': {'1': ['Write the step, or remove it.']}},
            id='a blank step',
        ),
        pytest.param(
            {'steps': [FRY, None]},
            {'steps': {'1': ['Write the step, or remove it.']}},
            id='a null step',
        ),
        pytest.param(
            {'steps': [FRY, 'a' * 2001]},
            {'steps': {'1': ['Keep a step to 2,000 characters. Split this one in two.']}},
            id='a step over 2,000 characters',
        ),
        pytest.param(
            {'steps': [FRY] * 101},
            {'steps': ['Keep the method to 100 steps.']},
            id='over 100 steps',
        ),
        pytest.param(
            {'equipment': ['hob', 'thermomix']},
            {'equipment': ['Object with slug=thermomix does not exist.']},
            id='equipment not on the list',
        ),
    ],
)
def test_a_method_the_recipe_cant_hold_is_refused_on_add_and_edit(
    body: dict[str, Any], refused: dict[str, Any]
) -> None:
    milo, slug = milos_curry(steps=[SIMMER], equipment=['oven'])

    added = milo.client.post(RECIPES, {'title': 'Lamb curry', **body}, format='json', **milo.csrf_header())
    edited = change(milo, slug, body)

    assert (added.status_code, added.json()) == (400, refused)
    assert (edited.status_code, edited.json()) == (400, refused)
    assert list(Recipe.objects.values_list('title', flat=True)) == [CURRY]
    assert method_of(milo.client.get(f'{RECIPES}{slug}/').json()) == ([SIMMER], [OVEN])


@pytest.mark.django_db
def test_a_step_of_exactly_2000_characters_is_kept() -> None:
    milo, slug = milos_curry()

    response = change(milo, slug, {'steps': ['a' * 2000]})

    assert (response.status_code, len(response.json()['steps'][0]['text'])) == (200, 2000)
