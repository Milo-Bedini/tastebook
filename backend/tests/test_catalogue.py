import json
import re
from collections import Counter
from pathlib import Path
from typing import Any

import pytest
from django.core.management import CommandError, call_command
from django.urls import reverse
from rest_framework.test import APIClient

from households.models import Household
from recipes.models import Course, Cuisine, Equipment, Ingredient, Recipe

HAND_WRITTEN = [
    'Chicken tikka masala',
    'Greek salad',
    'Oat and raisin cookies',
    'Spaghetti aglio e olio',
    'Spanish tortilla',
]
CREDIT = 'Adapted from the Wikibooks Cookbook (CC BY-SA 4.0), converted to metric, ingredients restructured'
WIKIBOOKS_PAGE = re.compile(r'^https://en\.wikibooks\.org/wiki/Cookbook:[^?#]+$')
SHORTLIST = Path(__file__).resolve().parent.parent / 'recipes' / 'catalogue-shortlist.json'

# A small catalogue for tests about loading, not about the repo's own file.
SHAKSHUKA: dict[str, Any] = {
    'slug': 'shakshuka',
    'title': 'Shakshuka',
    'description': 'Eggs in spiced tomatoes.',
    'cuisines': ['Spanish'],
    'courses': ['Breakfast', 'Main'],
    'difficulty': 'easy',
    'prep_minutes': 10,
    'cook_minutes': 20,
    'servings': 2,
    'equipment': ['Hob'],
    'one_pot': True,
    'source': 'Tastebook',
    'source_url': 'https://en.wikibooks.org/wiki/Cookbook:Shakshouka',
    'ingredient_lines': [{'amount': 1, 'unit': 'tbsp', 'ingredient': 'olive oil'}],
    'ingredient_groups': [
        {
            'name': 'For the sauce',
            'lines': [
                {'amount': 1, 'unit': 'tin', 'ingredient': 'chopped tomatoes'},
                {'amount': 0.5, 'amount_max': 1, 'unit': 'tsp', 'ingredient': 'paprika', 'note': 'smoked'},
            ],
        },
        {'name': 'To serve', 'lines': [{'amount': 4, 'ingredient': 'eggs', 'optional': True}]},
    ],
    'steps': ['Soften the tomatoes in the oil.', 'Crack in the eggs and cover.'],
}

FLAPJACKS: dict[str, Any] = {
    'slug': 'flapjacks',
    'title': 'Flapjacks',
    'difficulty': 'easy',
    'prep_minutes': 10,
    'cook_minutes': 25,
    'extra_minutes': 60,
    'extra_label': 'cooling',
    'yield_amount': 12,
    'yield_unit': 'squares',
    'source': 'Tastebook',
    'ingredient_lines': [{'amount': 250, 'unit': 'g', 'ingredient': 'porridge oats'}],
    'steps': ['Bake.'],
}


INGREDIENTS: list[dict[str, Any]] = [
    {'name': 'chopped tomatoes'},
    {'name': 'eggs', 'contains_egg': True},
    {'name': 'olive oil'},
    {'name': 'paprika'},
    {'name': 'porridge oats', 'contains_gluten': True},
]


def catalogue(*recipes: dict[str, Any], ingredients: list[Any] | None = None) -> dict[str, Any]:
    return {'equipment': ['Hob', 'Oven'], 'ingredients': ingredients or INGREDIENTS, 'recipes': list(recipes)}


def write(path: Path, contents: dict[str, Any]) -> Path:
    path.write_text(json.dumps(contents), encoding='utf-8')
    return path


def recipe_json(slug: str) -> dict[str, Any]:
    response = APIClient().get(reverse('recipe-detail', args=[slug]))
    assert response.status_code == 200
    return response.json()


def titles(q: str = '') -> list[str]:
    return [recipe['title'] for recipe in APIClient().get(reverse('recipe-list'), {'q': q}).json()]


# What a reader of the recipe page sees of each feature the seed has to cover.
def shape(recipe: dict[str, Any]) -> dict[str, Any]:
    lines = [*recipe['ingredient_lines'], *(line for group in recipe['ingredient_groups'] for line in group['lines'])]
    return {
        'groups': [group['name'] for group in recipe['ingredient_groups']],
        'ranges': [line['ingredient']['name'] for line in lines if line['amount_max'] is not None],
        'optional': [line['ingredient']['name'] for line in lines if line['optional']],
        'yield': (recipe['yield_amount'], recipe['yield_unit']),
        'extra': (recipe['extra_minutes'], recipe['extra_label']),
    }


@pytest.mark.django_db
def test_loads_the_repos_catalogue_in_place_of_the_recipes_already_there() -> None:
    Recipe.objects.create(
        title='Typed in the admin', difficulty='easy', prep_minutes=1, cook_minutes=1, servings=1, source='Me'
    )

    call_command('load_catalogue')

    loaded = titles()
    assert len(loaded) == 305
    assert [title for title in loaded if title in HAND_WRITTEN] == HAND_WRITTEN
    assert 'Typed in the admin' not in loaded


@pytest.mark.django_db
@pytest.mark.parametrize(
    ('slug', 'expected'),
    [
        (
            'chicken-tikka-masala',
            {
                'groups': ['For the marinade', 'For the sauce', 'To serve'],
                'ranges': ['chilli powder'],
                'optional': ['coriander'],
                'yield': (None, ''),
                'extra': (60, 'marinating'),
            },
        ),
        (
            'oat-and-raisin-cookies',
            {
                'groups': [],
                'ranges': [],
                'optional': ['ground cinnamon'],
                'yield': (16, 'cookies'),
                'extra': (30, 'chilling'),
            },
        ),
        (
            'spaghetti-aglio-e-olio',
            {
                'groups': [],
                'ranges': ['extra virgin olive oil', 'dried chilli flakes'],
                'optional': ['parmesan'],
                'yield': (None, ''),
                'extra': (0, ''),
            },
        ),
        (
            'greek-salad',
            {
                'groups': ['For the salad', 'For the dressing'],
                'ranges': [],
                'optional': [],
                'yield': (None, ''),
                'extra': (0, ''),
            },
        ),
        (
            'spanish-tortilla',
            {'groups': [], 'ranges': [], 'optional': [], 'yield': (None, ''), 'extra': (10, 'resting')},
        ),
    ],
)
def test_the_repos_recipes_cover_groups_ranges_optional_lines_a_yield_and_extra_time(
    slug: str, expected: dict[str, Any]
) -> None:
    call_command('load_catalogue')

    assert shape(recipe_json(slug)) == expected


@pytest.mark.django_db
@pytest.mark.parametrize(
    ('slug', 'diet_tags', 'conflicts'),
    [
        ('chicken-tikka-masala', ['gluten_free'], []),
        ('oat-and-raisin-cookies', ['vegetarian'], []),
        (
            'spaghetti-aglio-e-olio',
            ['vegetarian', 'vegan', 'dairy_free'],
            [('parmesan', ['vegetarian', 'vegan', 'dairy_free'])],
        ),
        ('greek-salad', ['vegetarian', 'gluten_free'], []),
        ('spanish-tortilla', ['vegetarian', 'gluten_free', 'dairy_free'], []),
    ],
)
def test_the_repos_recipes_get_their_diet_tags_from_what_their_ingredients_contain(
    slug: str, diet_tags: list[str], conflicts: list[tuple[str, list[str]]]
) -> None:
    call_command('load_catalogue')

    recipe = recipe_json(slug)
    assert recipe['diet_tags'] == diet_tags
    assert [
        (conflict['ingredient']['name'], conflict['diet_tags']) for conflict in recipe['diet_tag_conflicts']
    ] == conflicts


@pytest.mark.django_db
def test_loads_a_recipe_with_its_details_ingredients_and_method(tmp_path: Path) -> None:
    call_command('load_catalogue', write(tmp_path / 'catalogue.json', catalogue(SHAKSHUKA)))

    recipe = recipe_json('shakshuka')
    assert {key: value for key, value in recipe.items() if key not in {'id', 'ingredient_groups', 'steps'}} == {
        'slug': 'shakshuka',
        'visibility': 'public',
        'title': 'Shakshuka',
        'description': 'Eggs in spiced tomatoes.',
        'cuisines': [{'slug': 'spanish', 'name': 'Spanish'}],
        'difficulty': 'easy',
        'total_minutes': 30,
        'photo': None,
        'diet_tags': ['vegetarian', 'vegan', 'gluten_free', 'dairy_free'],
        'courses': [{'slug': 'breakfast', 'name': 'Breakfast'}, {'slug': 'main', 'name': 'Main'}],
        'prep_minutes': 10,
        'cook_minutes': 20,
        'extra_minutes': 0,
        'extra_label': '',
        'servings': 2,
        'yield_amount': None,
        'yield_unit': '',
        'equipment': [{'slug': 'hob', 'name': 'Hob'}],
        'one_pot': True,
        'source': 'Tastebook',
        'source_url': 'https://en.wikibooks.org/wiki/Cookbook:Shakshouka',
        'ingredient_lines': [
            {
                'id': recipe['ingredient_lines'][0]['id'],
                'amount': 1.0,
                'amount_max': None,
                'unit': 'tbsp',
                'ingredient': {'slug': 'olive-oil', 'name': 'olive oil', 'grams_per_cup': None},
                'note': '',
                'optional': False,
                'original_text': '',
            }
        ],
        'diet_tag_conflicts': [
            {'ingredient': {'slug': 'eggs', 'name': 'eggs', 'grams_per_cup': None}, 'diet_tags': ['vegan']}
        ],
    }
    assert [
        (group['name'], [(line['amount'], line['amount_max'], line['ingredient']['name']) for line in group['lines']])
        for group in recipe['ingredient_groups']
    ] == [
        ('For the sauce', [(1.0, None, 'chopped tomatoes'), (0.5, 1.0, 'paprika')]),
        ('To serve', [(4.0, None, 'eggs')]),
    ]
    assert [step['text'] for step in recipe['steps']] == [
        'Soften the tomatoes in the oil.',
        'Crack in the eggs and cover.',
    ]


@pytest.mark.django_db
def test_loading_the_same_file_twice_changes_nothing(tmp_path: Path) -> None:
    path = write(tmp_path / 'catalogue.json', catalogue(SHAKSHUKA, FLAPJACKS))
    call_command('load_catalogue', path)
    first = [recipe_json('shakshuka'), recipe_json('flapjacks')]

    call_command('load_catalogue', path)

    assert [recipe_json('shakshuka'), recipe_json('flapjacks')] == first
    assert first[0]['steps'][1]['text'] == 'Crack in the eggs and cover.'
    assert (Recipe.objects.count(), Ingredient.objects.count(), Equipment.objects.count()) == (2, 5, 2)


@pytest.mark.django_db
def test_loading_an_edited_file_overwrites_the_catalogue_with_it(tmp_path: Path) -> None:
    call_command('load_catalogue', write(tmp_path / 'first.json', catalogue(SHAKSHUKA, FLAPJACKS)))
    shakshuka_id = recipe_json('shakshuka')['id']
    edited = {
        **SHAKSHUKA,
        'title': 'Green shakshuka',
        'servings': None,
        'yield_amount': 1,
        'yield_unit': 'pan',
        'one_pot': False,
        'ingredient_lines': [],
        'ingredient_groups': [{'name': 'For the greens', 'lines': [{'amount': 3, 'ingredient': 'eggs'}]}],
        'steps': ['Wilt the greens.'],
    }
    del edited['equipment']

    call_command(
        'load_catalogue',
        write(tmp_path / 'second.json', catalogue(edited, ingredients=[{'name': 'eggs'}])),
    )

    recipe = recipe_json('shakshuka')
    assert (recipe['id'], recipe['title'], recipe['servings'], recipe['yield_amount'], recipe['yield_unit']) == (
        shakshuka_id,
        'Green shakshuka',
        None,
        1,
        'pan',
    )
    assert (recipe['one_pot'], recipe['equipment'], recipe['ingredient_lines']) == (False, [], [])
    assert [
        (group['name'], [(line['amount'], line['ingredient']['name']) for line in group['lines']])
        for group in recipe['ingredient_groups']
    ] == [('For the greens', [(3.0, 'eggs')])]
    assert [step['text'] for step in recipe['steps']] == ['Wilt the greens.']
    assert titles() == ['Green shakshuka']
    assert list(Ingredient.objects.values_list('name', flat=True)) == ['eggs']


# Each deploy loads the catalogue across the Atlantic, so a query per row timed builds out once it held 305 recipes.
@pytest.mark.django_db
def test_loading_the_repos_catalogue_takes_a_handful_of_queries_however_many_recipes_it_holds(
    django_assert_max_num_queries: Any,
) -> None:
    with django_assert_max_num_queries(50):
        call_command('load_catalogue')

    with django_assert_max_num_queries(50):
        call_command('load_catalogue')

    assert len(titles()) == 305


@pytest.mark.django_db
def test_loading_records_what_each_ingredient_contains_and_clears_what_the_file_leaves_out(tmp_path: Path) -> None:
    call_command('load_catalogue', write(tmp_path / 'first.json', catalogue(FLAPJACKS)))
    first = recipe_json('flapjacks')['diet_tags']

    oats = {'name': 'porridge oats', 'contains_dairy': True}
    call_command('load_catalogue', write(tmp_path / 'second.json', catalogue(FLAPJACKS, ingredients=[oats])))

    assert (first, recipe_json('flapjacks')['diet_tags']) == (
        ['vegetarian', 'vegan', 'dairy_free'],
        ['vegetarian', 'gluten_free'],
    )


@pytest.mark.django_db
def test_loading_records_what_a_cup_of_each_ingredient_weighs_and_clears_what_the_file_leaves_out(
    tmp_path: Path,
) -> None:
    oats = {'name': 'porridge oats', 'grams_per_cup': 81}
    call_command('load_catalogue', write(tmp_path / 'first.json', catalogue(FLAPJACKS, ingredients=[oats])))
    first = recipe_json('flapjacks')['ingredient_lines'][0]['ingredient']['grams_per_cup']

    call_command('load_catalogue', write(tmp_path / 'second.json', catalogue(FLAPJACKS)))

    assert (first, recipe_json('flapjacks')['ingredient_lines'][0]['ingredient']['grams_per_cup']) == (81, None)


@pytest.mark.django_db
@pytest.mark.parametrize(
    ('name', 'grams_per_cup'),
    [
        ('plain flour', 125),
        ('light brown soft sugar', 220),
        ('porridge oats', 81),
        ('raisins', 145),
        ('olive oil', None),
    ],
)
def test_the_catalogue_gives_dry_goods_what_a_cup_of_them_weighs(name: str, grams_per_cup: int | None) -> None:
    call_command('load_catalogue')

    assert Ingredient.objects.get(name=name).grams_per_cup == grams_per_cup


@pytest.mark.django_db
@pytest.mark.parametrize(
    ('q', 'expected'),
    [
        ('cilantro', ['Chicken tikka masala']),
        ('heavy cream', ['Chicken tikka masala']),
        ('all-purpose flour', ['Oat and raisin cookies']),
        ('red pepper flakes', ['Spaghetti aglio e olio']),
        ('green bell pepper', ['Greek salad']),
    ],
)
def test_the_repos_recipes_are_found_by_their_ingredients_us_names(q: str, expected: list[str]) -> None:
    call_command('load_catalogue')

    assert [title for title in titles(q) if title in HAND_WRITTEN] == expected


def wikibooks_recipes() -> list[dict[str, Any]]:
    summaries = APIClient().get(reverse('recipe-list')).json()
    return [
        recipe
        for recipe in map(recipe_json, (summary['slug'] for summary in summaries))
        if recipe['source'] != 'Tastebook'
    ]


@pytest.mark.django_db
def test_every_wikibooks_recipe_is_credited_and_links_to_its_page() -> None:
    call_command('load_catalogue')

    recipes = wikibooks_recipes()
    assert len(recipes) == 300
    assert {recipe['source'] for recipe in recipes} == {CREDIT}
    assert [recipe['slug'] for recipe in recipes if not WIKIBOOKS_PAGE.match(recipe['source_url'])] == []


@pytest.mark.django_db
def test_no_recipe_in_the_repos_catalogue_measures_in_cups_ounces_or_pounds() -> None:
    call_command('load_catalogue')

    units = {
        line['unit']
        for summary in APIClient().get(reverse('recipe-list')).json()
        for recipe in [recipe_json(summary['slug'])]
        for line in [
            *recipe['ingredient_lines'],
            *(line for group in recipe['ingredient_groups'] for line in group['lines']),
        ]
    }
    assert {'g', 'ml'} <= units
    assert units & {'cup', 'oz', 'lb', 'fl_oz'} == set()


# The US words the TAS-48 spec's UK names table replaces, in titles, steps and notes.
US_WORDS = re.compile(
    r'\b(all-purpose flour|ground beef|cilantro|shrimps?|zucchinis?|arugula|eggplants?|garbanzo beans?|scallions?'
    r'|green onions?|molasses|heavy cream|light cream|semi-?sweet chocolate|golden raisins|powdered sugar'
    r"|confectioners'? sugar|canola oil|superfine sugar|bell peppers?|baking soda|cornstarch|yogurts?|chili(e?s)?"
    r'|broil(s|ed|ing|er)?|skillets?|stove(top)?s?|plastic wrap|alumin(i)?um foil|cookie sheets?)\b',
    re.IGNORECASE,
)
# Dishes whose own name uses the US word.
NAMED_WITH_A_US_WORD = {'Skillet cornbread'}


@pytest.mark.django_db
def test_the_repos_recipes_use_uk_words_in_titles_steps_and_notes() -> None:
    call_command('load_catalogue')

    copy = [
        (recipe['slug'], text)
        for summary in APIClient().get(reverse('recipe-list')).json()
        for recipe in [recipe_json(summary['slug'])]
        for text in [
            *([] if recipe['title'] in NAMED_WITH_A_US_WORD else [recipe['title']]),
            *(step['text'] for step in recipe['steps']),
            *(
                line['note']
                for line in [
                    *recipe['ingredient_lines'],
                    *(line for group in recipe['ingredient_groups'] for line in group['lines']),
                ]
            ),
        ]
    ]
    assert ('meat-and-prawn-potstickers', 'Meat and prawn potstickers') in copy
    assert [(slug, match.group(0)) for slug, text in copy for match in US_WORDS.finditer(text)] == []


# Lines whose amount comes from a measure the line doesn't write in grams or millilitres.
UNROUNDED_BY_SOURCE = {
    ('gazpacho', 'water'),  # 2.4 dl
    ('toad-in-the-hole', 'plain flour'),  # the Yorkshire pudding recipe's batter
}


def rounded(amount: float) -> bool:
    return amount < 10 or amount % (25 if amount >= 100 else 5) == 0


@pytest.mark.django_db
def test_the_repos_recipes_round_converted_grams_and_millilitres_as_the_spec_says() -> None:
    call_command('load_catalogue')

    lines = [
        (recipe['slug'], line)
        for summary in APIClient().get(reverse('recipe-list')).json()
        for recipe in [recipe_json(summary['slug'])]
        for line in [
            *recipe['ingredient_lines'],
            *(line for group in recipe['ingredient_groups'] for line in group['lines']),
        ]
        if line['unit'] in {'g', 'ml'} and (summary['slug'], line['ingredient']['name']) not in UNROUNDED_BY_SOURCE
    ]
    unrounded = [
        (slug, line['ingredient']['name'], amount)
        for slug, line in lines
        for amount in (line['amount'], line['amount_max'])
        if amount is not None
        and not rounded(amount)
        and f'{amount:g}' not in re.findall(r'\d+(?:\.\d+)?', line['original_text'].replace(',', ''))
    ]
    assert ('arroz-con-maiz', 'paella rice', 725) in [
        (slug, line['ingredient']['name'], line['amount']) for slug, line in lines
    ]
    assert unrounded == []


@pytest.mark.django_db
def test_every_ingredient_the_filter_offers_is_used_by_a_recipe_in_the_repos_catalogue() -> None:
    call_command('load_catalogue')

    used = {
        line['ingredient']['name']
        for summary in APIClient().get(reverse('recipe-list')).json()
        for recipe in [recipe_json(summary['slug'])]
        for line in [
            *recipe['ingredient_lines'],
            *(line for group in recipe['ingredient_groups'] for line in group['lines']),
        ]
    }
    offered = [ingredient['name'] for ingredient in APIClient().get(reverse('ingredient-list')).json()]
    assert 'olive oil' in offered
    assert [name for name in offered if name not in used] == []


@pytest.mark.django_db
def test_every_photo_in_the_repos_catalogue_has_a_licence_that_allows_reuse() -> None:
    call_command('load_catalogue')

    photos = [summary['photo'] for summary in APIClient().get(reverse('recipe-list')).json() if summary['photo']]
    assert photos != []
    allowed = re.compile(r'^(Public domain|CC0 1\.0|CC BY(-SA)? \d\.\d( [a-z]{2,3})?)$')
    assert [photo['licence'] for photo in photos if not allowed.match(photo['licence'])] == []


@pytest.mark.django_db
def test_the_shortlist_holds_about_300_wikibooks_pages_spread_across_cuisines() -> None:
    # The shortlist is the plan the batches work through, not loaded, so it is read as a file.
    shortlist = json.loads(SHORTLIST.read_text(encoding='utf-8'))
    cuisines = {cuisine['name'] for cuisine in APIClient().get(reverse('cuisine-list')).json()}

    pages = [entry['page'] for entry in shortlist]
    per_cuisine = Counter(entry['cuisine'] for entry in shortlist)
    assert 280 <= len(shortlist) <= 320
    assert len(set(pages)) == len(pages)
    assert [page for page in pages if not WIKIBOOKS_PAGE.match(page)] == []
    assert set(per_cuisine) <= cuisines
    assert {entry['course'] for entry in shortlist} <= {'Baking', 'Breakfast', 'Dessert', 'Main', 'Side'}
    assert [cuisine for cuisine, count in per_cuisine.items() if count > 40] == []
    batches = Counter(entry['batch'] for entry in shortlist if entry['batch'] is not None)
    assert batches == {1: 50, 2: 50, 3: 50, 4: 50, 5: 50, 6: 50}


@pytest.mark.django_db
def test_the_catalogue_holds_the_shortlists_batches() -> None:
    call_command('load_catalogue')

    shortlist = json.loads(SHORTLIST.read_text(encoding='utf-8'))
    assert {recipe['source_url'] for recipe in wikibooks_recipes()} == {
        entry['page'] for entry in shortlist if entry['batch'] is not None
    }


def with_synonyms(synonyms: dict[str, list[str]]) -> list[dict[str, Any]]:
    return [{**record, 'synonyms': synonyms.get(record['name'], [])} for record in INGREDIENTS]


@pytest.mark.django_db
def test_loading_an_edited_file_moves_and_removes_synonyms(tmp_path: Path) -> None:
    first = with_synonyms({'porridge oats': ['pimentón'], 'paprika': ['red powder']})
    call_command('load_catalogue', write(tmp_path / 'first.json', catalogue(SHAKSHUKA, FLAPJACKS, ingredients=first)))
    before = (titles('pimenton'), titles('red powder'))

    second = with_synonyms({'paprika': ['pimentón']})
    call_command('load_catalogue', write(tmp_path / 'second.json', catalogue(SHAKSHUKA, FLAPJACKS, ingredients=second)))

    assert before == (['Flapjacks'], ['Shakshuka'])
    assert (titles('pimenton'), titles('red powder')) == (['Shakshuka'], [])


PHOTO = {
    'photo_url': 'https://upload.wikimedia.org/wikipedia/commons/7/7e/Shakshuka_%28Tel_Aviv%29.jpg',
    'photo_author': 'Jane Doe',
    'photo_licence': 'CC BY-SA 4.0',
    'photo_source_url': 'https://commons.wikimedia.org/wiki/File:Shakshuka_(Tel_Aviv).jpg',
}


def with_line(**line: Any) -> dict[str, Any]:
    return catalogue({**FLAPJACKS, 'ingredient_lines': [{'ingredient': 'porridge oats', **line}]})


@pytest.mark.django_db
@pytest.mark.parametrize(
    ('contents', 'message'),
    [
        (
            catalogue({**FLAPJACKS, 'serves': 4}),
            'Recipe flapjacks has fields the catalogue does not know: serves',
        ),
        (
            catalogue({**FLAPJACKS, 'servings': 4}),
            'Recipe flapjacks: Give servings or a yield with its unit, not both.',
        ),
        (
            catalogue({**FLAPJACKS, 'extra_label': ''}),
            'Recipe flapjacks: Give extra time with its label (marinating, resting, proving), or neither.',
        ),
        (
            catalogue({**FLAPJACKS, 'difficulty': 'impossible'}),
            "Recipe flapjacks: Value 'impossible' is not a valid choice.",
        ),
        (
            catalogue({**FLAPJACKS, 'yield_amount': 0}),
            'Recipe flapjacks: Ensure this value is greater than or equal to 1.',
        ),
        (
            catalogue({**FLAPJACKS, 'source': ''}),
            'Recipe flapjacks: A catalogue recipe needs a difficulty, prep and cook times, servings or a yield, '
            'and a source credit.',
        ),
        (
            catalogue({**FLAPJACKS, **PHOTO, 'photo_licence': ''}),
            'Recipe flapjacks: Give a photo with its author, licence and source, or none of them.',
        ),
        (
            catalogue({**FLAPJACKS, **PHOTO, 'photo_url': 'https://example.com/flapjacks.jpg'}),
            'Recipe flapjacks: Give the address of a JPEG, PNG or WebP file on Wikimedia Commons, '
            'starting https://upload.wikimedia.org/wikipedia/commons/.',
        ),
        (
            catalogue({**FLAPJACKS, **PHOTO, 'photo_source_url': 'https://example.com/flapjacks'}),
            "Recipe flapjacks: Give the photo's page on Wikimedia Commons, "
            'starting https://commons.wikimedia.org/wiki/File:.',
        ),
        (
            catalogue({**FLAPJACKS, 'cuisines': ['Klingon']}),
            'Recipe flapjacks names no known cuisine: "Klingon"',
        ),
        (
            with_line(ingredient='golden syrup'),
            'Recipe flapjacks names no known ingredient: "golden syrup"',
        ),
        (
            with_line(amount=3, amount_max=2),
            'Recipe flapjacks: Give a range with its lower amount first, such as 2 up to 3.',
        ),
        (
            with_line(amount=0),
            'Recipe flapjacks: Give an amount above 0, or leave it empty.',
        ),
        (
            with_line(unit='handfuls'),
            "Recipe flapjacks: Value 'handfuls' is not a valid choice.",
        ),
        *(
            (
                catalogue({key: value for key, value in FLAPJACKS.items() if key not in left_out}),
                'Recipe flapjacks: A catalogue recipe needs a difficulty, prep and cook times, servings or a yield, '
                'and a source credit.',
            )
            for left_out in [{'difficulty'}, {'prep_minutes'}, {'source'}, {'yield_amount', 'yield_unit'}]
        ),
        (
            catalogue({**FLAPJACKS, 'slug': 'new'}),
            'The recipe slug "new" is the address of the form for adding a recipe; give the recipe another slug',
        ),
        (
            catalogue({key: value for key, value in FLAPJACKS.items() if key != 'slug'}),
            'Every recipe needs a slug: it keeps the recipe the same recipe from one load to the next',
        ),
        (
            catalogue(FLAPJACKS, {**SHAKSHUKA, 'slug': 'flapjacks'}),
            'Recipe slugs must be unique, but these repeat: flapjacks',
        ),
        (
            catalogue(FLAPJACKS, ingredients=['porridge oats']),
            "Each ingredient must be an object with its name, but these are not: ['porridge oats']",
        ),
        (
            catalogue(FLAPJACKS, ingredients=[{'name': 'porridge oats', 'contains_nuts': True}]),
            'Ingredient "porridge oats" has fields the catalogue does not know: contains_nuts',
        ),
        (
            catalogue(FLAPJACKS, ingredients=[{'name': 'porridge oats', 'slug': 'oats'}]),
            'Ingredient "porridge oats" has fields the catalogue does not know: slug',
        ),
        (
            catalogue(FLAPJACKS, ingredients=[{'name': 'porridge oats', 'grams_per_cup': 0}]),
            'Ingredient "porridge oats": Ensure this value is greater than or equal to 1.',
        ),
        (
            catalogue(FLAPJACKS, ingredients=[{'name': 'porridge oats'}, {'name': 'Porridge oats'}]),
            'Ingredient slugs must be unique, but these repeat: porridge-oats',
        ),
        (
            catalogue(FLAPJACKS, ingredients=[{'name': 'porridge oats', 'synonyms': 'rolled oats'}]),
            'Ingredient "porridge oats" must give its synonyms as a list of names',
        ),
        (
            catalogue(
                FLAPJACKS,
                ingredients=[
                    {'name': 'porridge oats', 'synonyms': ['oats']},
                    {'name': 'paprika', 'synonyms': ['oats']},
                ],
            ),
            'Ingredient "paprika": Ingredient synonym with this Name already exists.',
        ),
    ],
)
def test_a_file_the_database_cant_hold_fails_and_changes_nothing(
    tmp_path: Path, contents: dict[str, Any], message: str
) -> None:
    call_command('load_catalogue', write(tmp_path / 'first.json', catalogue(SHAKSHUKA)))

    with pytest.raises(CommandError) as error:
        call_command('load_catalogue', write(tmp_path / 'second.json', contents))

    assert str(error.value) == message
    assert titles() == ['Shakshuka']


def household_recipe() -> Recipe:
    recipe = Recipe.objects.create(
        household=Household.objects.create(name='The Quillfeathers'), title="Grandma's curry", slug='grandmas-curry'
    )
    recipe.cuisines.set(Cuisine.objects.filter(name='Italian'))
    recipe.courses.set(Course.objects.filter(name='Main'))
    return recipe


@pytest.mark.django_db
def test_loading_leaves_a_households_recipe_its_cuisines_and_its_courses_alone(tmp_path: Path) -> None:
    household_recipe()

    call_command('load_catalogue', write(tmp_path / 'catalogue.json', catalogue(SHAKSHUKA)))

    recipe = Recipe.objects.get(household__isnull=False)
    assert (recipe.slug, recipe.title) == ('grandmas-curry', "Grandma's curry")
    assert [cuisine.name for cuisine in recipe.cuisines.all()] == ['Italian']
    assert [course.name for course in recipe.courses.all()] == ['Main']


@pytest.mark.django_db
def test_a_file_recipe_with_a_households_recipes_slug_fails_and_leaves_it_alone(tmp_path: Path) -> None:
    household_recipe()

    with pytest.raises(CommandError) as error:
        call_command(
            'load_catalogue',
            write(tmp_path / 'catalogue.json', catalogue({**SHAKSHUKA, 'slug': 'grandmas-curry'})),
        )

    assert str(error.value) == 'Recipe grandmas-curry: Recipe with this Slug already exists.'
    assert Recipe.objects.get(slug='grandmas-curry').title == "Grandma's curry"
