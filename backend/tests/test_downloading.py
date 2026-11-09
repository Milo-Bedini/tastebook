from typing import Any

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from pytest_django.fixtures import Settings
from rest_framework.test import APIClient

from recipes.models import Recipe
from tests.test_recipes import ingredient
from tests.test_seed import seeded, signed_in_as

DOWNLOAD = '/api/account/download/'


def complete(title: str, **fields: Any) -> dict[str, Any]:
    """A recipe with everything publishing needs, in the catalogue file's shape."""
    return {
        'title': title,
        'prep_minutes': 10,
        'cook_minutes': 20,
        'servings': 2,
        'ingredient_lines': [{'amount': 1, 'ingredient': 'onion'}],
        'steps': ['Cook it.'],
        **fields,
    }


def address(slug: str) -> str:
    return f'http://testserver/recipes/{slug}'


def slugs_of(body: dict[str, Any], key: str) -> dict[str, str]:
    return {recipe['title']: recipe['slug'] for recipe in body['accounts'][key]['recipes']}


@pytest.fixture
def onion() -> None:
    ingredient('onion')


@pytest.mark.django_db
def test_a_visitor_is_refused() -> None:
    assert APIClient().get(DOWNLOAD).status_code == 403


@pytest.mark.django_db
def test_the_download_is_a_tastebook_file_named_for_the_day_with_the_account_details(
    test_accounts: Settings, onion: None
) -> None:
    body = seeded({'name': 'The Lovelaces', 'members': [{'key': 'ada', 'name': 'Ada', 'unit_system': 'us'}]})

    response = signed_in_as(body, 'ada').get(DOWNLOAD)
    download = response.json()

    assert response.status_code == 200
    assert response['Content-Type'] == 'application/json'
    assert response['Content-Disposition'] == f'attachment; filename="tastebook-{download["exported_at"][:10]}.json"'
    assert (download['format'], download['version']) == ('tastebook', 1)
    assert download['account'] == {
        'name': 'Ada',
        'email': body['accounts']['ada']['email'],
        'unit_system': 'us',
        'household_name': 'The Lovelaces',
    }
    assert (download['recipes'], download['lists']) == ([], [])


@pytest.mark.django_db
def test_it_holds_the_households_private_recipes_and_your_own_public_ones_but_no_one_elses(
    test_accounts: Settings, onion: None
) -> None:
    body = seeded(
        {
            'members': [
                {
                    'key': 'ada',
                    'name': 'Ada',
                    'recipes': [complete("Ada's curry"), complete("Ada's bread", visibility='public')],
                },
                {
                    'key': 'ben',
                    'name': 'Ben',
                    'recipes': [complete("Ben's stew"), complete("Ben's salad", visibility='public')],
                },
            ]
        },
        {
            'members': [
                {
                    'key': 'cy',
                    'name': 'Cy',
                    'recipes': [complete("Cy's secret"), complete("Cy's pie", visibility='public')],
                }
            ]
        },
    )
    ada, ben = slugs_of(body, 'ada'), slugs_of(body, 'ben')

    download = signed_in_as(body, 'ada').get(DOWNLOAD).json()

    assert [(recipe['title'], recipe['address']) for recipe in download['recipes']] == [
        ("Ada's bread", address(ada["Ada's bread"])),
        ("Ada's curry", address(ada["Ada's curry"])),
        ("Ben's stew", address(ben["Ben's stew"])),
    ]


@pytest.mark.django_db
def test_a_recipe_is_in_the_catalogue_files_shape_with_its_address(test_accounts: Settings, onion: None) -> None:
    ingredient('tomato')
    curry = {
        'title': "Ada's curry",
        'description': 'Mild and quick.',
        'cuisines': ['Indian'],
        'courses': ['Main'],
        'difficulty': 'easy',
        'prep_minutes': 15,
        'cook_minutes': 30,
        'extra_minutes': 60,
        'extra_label': 'marinating',
        'servings': None,
        'yield_amount': 12,
        'yield_unit': 'skewers',
        'equipment': ['Hob'],
        'one_pot': True,
        'source': 'Grandma',
        'source_url': 'https://example.com/curry',
        'photo_url': 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Curry.jpg',
        'photo_author': 'Jo',
        'photo_licence': 'CC BY-SA 4.0',
        'photo_source_url': 'https://commons.wikimedia.org/wiki/File:Curry.jpg',
        'ingredient_lines': [
            {
                'amount': 1.5,
                'amount_max': 2,
                'unit': 'kg',
                'ingredient': 'onion',
                'note': 'sliced',
                'optional': False,
                'original_text': '1.5 to 2 kg onions, sliced',
            }
        ],
        'ingredient_groups': [
            {
                'name': 'To serve',
                'lines': [
                    {
                        'amount': None,
                        'amount_max': None,
                        'unit': '',
                        'ingredient': 'tomato',
                        'note': '',
                        'optional': True,
                        'original_text': '',
                    }
                ],
            }
        ],
        'steps': ['Fry the onions.', 'Add the tomatoes.'],
    }
    body = seeded({'members': [{'key': 'ada', 'name': 'Ada', 'recipes': [curry]}]})

    download = signed_in_as(body, 'ada').get(DOWNLOAD).json()

    assert download['recipes'] == [{'address': address(slugs_of(body, 'ada')["Ada's curry"]), **curry}]


@pytest.mark.django_db
def test_a_downloaded_recipe_reads_back_as_the_same_recipe(test_accounts: Settings, onion: None) -> None:
    curry = complete(
        "Ada's curry",
        ingredient_groups=[
            {'name': 'For the sauce', 'lines': [{'amount': 2.25, 'unit': 'tbsp', 'ingredient': 'onion'}]}
        ],
    )
    first = signed_in_as(seeded({'members': [{'key': 'ada', 'name': 'Ada', 'recipes': [curry]}]}), 'ada')
    [exported] = first.get(DOWNLOAD).json()['recipes']
    record = {name: value for name, value in exported.items() if name != 'address'}

    second = signed_in_as(seeded({'members': [{'key': 'ben', 'name': 'Ben', 'recipes': [record]}]}), 'ben')
    [imported] = second.get(DOWNLOAD).json()['recipes']

    assert imported['address'] != exported['address']
    assert {**imported, 'address': exported['address']} == exported


@pytest.mark.django_db
def test_it_holds_every_list_you_see_newest_saved_first_with_unavailable_recipes_as_no_address(
    test_accounts: Settings, onion: None
) -> None:
    body = seeded(
        {
            'members': [
                {
                    'key': 'ada',
                    'name': 'Ada',
                    'saves': ["Ben's stew", "Cy's pie", "Cy's tart"],
                    'lists': [
                        {'name': 'Weeknight', 'recipes': ["Ben's stew"]},
                        {'name': 'Sunday', 'scope': 'household', 'recipes': ["Cy's pie"]},
                    ],
                },
                {
                    'key': 'ben',
                    'name': 'Ben',
                    'recipes': [complete("Ben's stew")],
                    'lists': [{'name': "Ben's own", 'recipes': ["Ben's stew"]}],
                },
            ]
        },
        {
            'members': [
                {
                    'key': 'cy',
                    'name': 'Cy',
                    'recipes': [complete("Cy's pie", visibility='public'), complete("Cy's tart", visibility='public')],
                    'made_private': ["Cy's tart"],
                }
            ]
        },
    )
    ben, cy = slugs_of(body, 'ben'), slugs_of(body, 'cy')

    download = signed_in_as(body, 'ada').get(DOWNLOAD).json()

    assert [
        (found['name'], found['scope'], [(saved['title'], saved['address']) for saved in found['saved_recipes']])
        for found in download['lists']
    ] == [
        (
            'Favourites',
            'personal',
            [("Cy's tart", None), ("Cy's pie", address(cy["Cy's pie"])), ("Ben's stew", address(ben["Ben's stew"]))],
        ),
        ('Weeknight', 'personal', [("Ben's stew", address(ben["Ben's stew"]))]),
        ('Sunday', 'household', [("Cy's pie", address(cy["Cy's pie"]))]),
    ]
    assert all(saved['saved_at'] for found in download['lists'] for saved in found['saved_recipes'])


@pytest.mark.django_db
def test_the_download_takes_the_same_queries_however_many_recipes_and_lists_there_are(
    test_accounts: Settings, onion: None
) -> None:
    def queries(recipes: int) -> int:
        titles = [f'Recipe {n}' for n in range(recipes)]
        body = seeded(
            {
                'members': [
                    {
                        'key': 'ada',
                        'name': 'Ada',
                        'recipes': [complete(title, cuisines=['Indian']) for title in titles],
                        'saves': titles,
                        'lists': [{'name': f'List {n}', 'recipes': titles} for n in range(recipes)],
                    }
                ]
            }
        )
        client = signed_in_as(body, 'ada')
        with CaptureQueriesContext(connection) as captured:
            client.get(DOWNLOAD)
        Recipe.objects.all().delete()
        return len(captured)

    assert queries(1) == queries(4)
