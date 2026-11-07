from decimal import Decimal
from typing import Any

import pytest
from django.test import Client
from django.urls import reverse
from pytest_django import DjangoAssertNumQueries
from rest_framework.test import APIClient

from households.models import Household, User
from recipes.models import (
    Course,
    Cuisine,
    Equipment,
    Ingredient,
    IngredientGroup,
    IngredientLine,
    IngredientSynonym,
    Recipe,
    Step,
    Visibility,
)

# A valid recipe's details, for tests about something else.
DETAILS: dict[str, Any] = {
    'difficulty': 'easy',
    'prep_minutes': 10,
    'cook_minutes': 20,
    'servings': 4,
    'source': 'Tastebook',
}


def make_recipe(**fields: Any) -> Recipe:
    """A catalogue recipe, unless the fields give it a household, when it's private until they say otherwise."""
    visibility = Visibility.PRIVATE if 'household' in fields else Visibility.PUBLIC
    return Recipe.objects.create(**{**DETAILS, 'visibility': visibility, **fields})


def ingredient(name: str) -> Ingredient:
    return Ingredient.objects.get_or_create(name=name, defaults={'slug': name.replace(' ', '-')})[0]


def add_line(recipe: Recipe, name: str, **fields: Any) -> IngredientLine:
    return IngredientLine.objects.create(recipe=recipe, ingredient=ingredient(name), **fields)


@pytest.mark.django_db
def test_lists_recipes_alphabetically_ignoring_case_oldest_first_on_a_tie() -> None:
    for title, description in [
        ('Shakshuka', 'Eggs in spiced tomatoes.'),
        ('banana bread', ''),
        ('Apple tart', 'Sharp apples.'),
        ('Shakshuka', 'Green version.'),
        ('apple pie', ''),
    ]:
        make_recipe(title=title, description=description)

    response = APIClient().get(reverse('recipe-list'))

    assert response.status_code == 200
    assert [(recipe['title'], recipe['description']) for recipe in response.json()] == [
        ('apple pie', ''),
        ('Apple tart', 'Sharp apples.'),
        ('banana bread', ''),
        ('Shakshuka', 'Eggs in spiced tomatoes.'),
        ('Shakshuka', 'Green version.'),
    ]


@pytest.mark.django_db
def test_returns_a_summary_of_each_recipe_with_its_total_time_and_difficulty() -> None:
    recipe = make_recipe(
        title='Shakshuka',
        description='Eggs in spiced tomatoes.',
        difficulty='medium',
        prep_minutes=10,
        cook_minutes=25,
        extra_minutes=5,
        extra_label='resting',
        one_pot=True,
    )

    response = APIClient().get(reverse('recipe-list'))

    assert response.json() == [
        {
            'id': recipe.id,
            'slug': 'shakshuka',
            'visibility': 'public',
            'author': None,
            'title': 'Shakshuka',
            'description': 'Eggs in spiced tomatoes.',
            'cuisines': [],
            'difficulty': 'medium',
            'total_minutes': 40,
            'photo': None,
            'diet_tags': [],
        }
    ]


@pytest.mark.django_db
def test_returns_an_empty_list_with_no_recipes() -> None:
    response = APIClient().get(reverse('recipe-list'))

    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.django_db
@pytest.mark.parametrize(
    ('title', 'slug'),
    [
        ('Apple tart', 'apple-tart'),
        ('Crème brûlée', 'creme-brulee'),
        ('  Eggs & soldiers!  ', 'eggs-soldiers'),
        ('!!!', 'recipe'),
    ],
)
def test_makes_a_slug_from_the_title(title: str, slug: str) -> None:
    recipe = make_recipe(title=title)

    assert recipe.slug == slug


@pytest.mark.django_db
def test_numbers_clashing_slugs_from_2_skipping_one_already_taken() -> None:
    for title in ['Shakshuka 2', 'Shakshuka', 'Shakshuka', 'Shakshuka']:
        make_recipe(title=title)

    assert list(Recipe.objects.order_by('id').values_list('slug', flat=True)) == [
        'shakshuka-2',
        'shakshuka',
        'shakshuka-3',
        'shakshuka-4',
    ]


@pytest.mark.django_db
@pytest.mark.parametrize(('slug', 'status_code'), [('shakshuka', 200), ('apple-tart', 404)])
def test_returns_a_recipe_by_its_slug_or_404_for_an_unknown_one(slug: str, status_code: int) -> None:
    make_recipe(title='Shakshuka', description='Eggs in spiced tomatoes.')

    response = APIClient().get(reverse('recipe-detail', args=[slug]))

    assert response.status_code == status_code


@pytest.mark.django_db
def test_returns_the_whole_recipe_with_its_details() -> None:
    recipe = make_recipe(
        title='Shakshuka',
        description='Eggs in spiced tomatoes.',
        difficulty='medium',
        prep_minutes=10,
        cook_minutes=25,
        extra_minutes=5,
        extra_label='resting',
        servings=2,
        one_pot=True,
        source='Adapted from the Wikibooks Cookbook (CC BY-SA 4.0)',
        source_url='https://en.wikibooks.org/wiki/Cookbook:Shakshouka',
    )
    recipe.cuisines.add(Cuisine.objects.get(slug='italian'))
    recipe.courses.set(Course.objects.filter(slug__in=['main', 'breakfast']))
    recipe.equipment.set(Equipment.objects.filter(slug__in=['oven', 'hob']))

    response = APIClient().get(reverse('recipe-detail', args=['shakshuka']))

    assert response.json() == {
        'id': recipe.id,
        'slug': 'shakshuka',
        'visibility': 'public',
        'author': None,
        'title': 'Shakshuka',
        'description': 'Eggs in spiced tomatoes.',
        'cuisines': [{'slug': 'italian', 'name': 'Italian'}],
        'difficulty': 'medium',
        'total_minutes': 40,
        'photo': None,
        'diet_tags': [],
        'courses': [{'slug': 'breakfast', 'name': 'Breakfast'}, {'slug': 'main', 'name': 'Main'}],
        'prep_minutes': 10,
        'cook_minutes': 25,
        'extra_minutes': 5,
        'extra_label': 'resting',
        'servings': 2,
        'yield_amount': None,
        'yield_unit': '',
        'equipment': [{'slug': 'hob', 'name': 'Hob'}, {'slug': 'oven', 'name': 'Oven'}],
        'one_pot': True,
        'source': 'Adapted from the Wikibooks Cookbook (CC BY-SA 4.0)',
        'source_url': 'https://en.wikibooks.org/wiki/Cookbook:Shakshouka',
        'ingredient_lines': [],
        'ingredient_groups': [],
        'steps': [],
        'diet_tag_conflicts': [],
        'can_delete': False,
        'can_edit': False,
        'can_publish': False,
        'save_count': None,
    }


@pytest.mark.django_db
@pytest.mark.parametrize(
    ('q', 'titles'),
    [
        ('tart', ['Apple tart', 'Tarte Tatin']),
        ('TART', ['Apple tart', 'Tarte Tatin']),
        ('creme', ['Crème brûlée']),
        ('CRÈME', ['Crème brûlée']),
        ('brulee', ['Crème brûlée']),
        ('  bread  ', ['Banana bread']),
        ('pie', []),
        ('%', []),
        ('_', []),
        ('', ['Apple tart', 'Banana bread', 'Crème brûlée', 'Tarte Tatin']),
    ],
)
def test_searches_titles_anywhere_ignoring_case_accents_and_surrounding_spaces(q: str, titles: list[str]) -> None:
    for title in ['Tarte Tatin', 'Crème brûlée', 'Banana bread', 'Apple tart']:
        make_recipe(title=title)

    response = APIClient().get(reverse('recipe-list'), {'q': q})

    assert response.status_code == 200
    assert [recipe['title'] for recipe in response.json()] == titles


def make_searchable_recipes() -> None:
    IngredientSynonym.objects.create(ingredient=ingredient('aubergine'), name='eggplant')
    IngredientSynonym.objects.create(ingredient=ingredient('courgette'), name='zucchini')
    make_recipe(title='Stuffed aubergines')
    make_recipe(title='Baba ganoush', description='A smoky aubergine dip.')
    moussaka = make_recipe(title='Moussaka', description='Baked layers of aubergine and lamb.')
    add_line(moussaka, 'aubergine', note='sliced')
    add_line(moussaka, 'aubergine', note='diced', optional=True)
    add_line(moussaka, 'crème fraîche')
    ratatouille = make_recipe(title='Ratatouille')
    add_line(ratatouille, 'courgette')
    ratatouille.cuisines.set(Cuisine.objects.filter(slug='french'))
    make_recipe(title='Pad thai').cuisines.set(Cuisine.objects.filter(slug='thai'))
    make_recipe(title='Green curry').cuisines.set(Cuisine.objects.filter(slug='thai'))


@pytest.mark.django_db
@pytest.mark.parametrize(
    ('q', 'titles'),
    [
        ('eggplant', ['Moussaka']),
        ('EGGPLANT', ['Moussaka']),
        ('courgette', ['Ratatouille']),
        (' Zucchini ', ['Ratatouille']),
        ('smoky', ['Baba ganoush']),
        ('creme fraiche', ['Moussaka']),
        ('french', ['Ratatouille']),
        ('aubergine', ['Stuffed aubergines', 'Baba ganoush', 'Moussaka']),
        ('thai', ['Pad thai', 'Green curry']),
        ('kale', []),
    ],
)
def test_searches_descriptions_ingredients_their_synonyms_and_cuisines_with_title_matches_first(
    q: str, titles: list[str]
) -> None:
    make_searchable_recipes()

    response = APIClient().get(reverse('recipe-list'), {'q': q})

    assert response.status_code == 200
    assert [recipe['title'] for recipe in response.json()] == titles


@pytest.mark.django_db
def test_searches_in_three_queries(django_assert_num_queries: DjangoAssertNumQueries) -> None:
    make_searchable_recipes()

    # The matching ingredients, synonyms and cuisines are subqueries of the list's one query.
    with django_assert_num_queries(3):
        response = APIClient().get(reverse('recipe-list'), {'q': 'aubergine'})

    assert response.status_code == 200
    assert [recipe['title'] for recipe in response.json()] == ['Stuffed aubergines', 'Baba ganoush', 'Moussaka']


@pytest.mark.django_db
def test_lists_the_seeded_courses_alphabetically() -> None:
    response = APIClient().get(reverse('course-list'))

    assert response.status_code == 200
    assert [course['name'] for course in response.json()] == ['Baking', 'Breakfast', 'Dessert', 'Main', 'Side']
    assert response.json()[0] == {'slug': 'baking', 'name': 'Baking'}


@pytest.mark.django_db
def test_lists_the_seeded_cuisines_alphabetically() -> None:
    response = APIClient().get(reverse('cuisine-list'))

    assert response.status_code == 200
    assert [cuisine['name'] for cuisine in response.json()] == [
        'American',
        'British',
        'Caribbean',
        'Chinese',
        'French',
        'German',
        'Greek',
        'Indian',
        'Italian',
        'Japanese',
        'Korean',
        'Mexican',
        'Middle Eastern',
        'Moroccan',
        'Spanish',
        'Thai',
        'Turkish',
        'Vietnamese',
    ]
    assert {'slug': 'middle-eastern', 'name': 'Middle Eastern'} in response.json()


@pytest.mark.django_db
def test_a_staff_user_adds_a_cuisine_in_the_admin(admin_client: Client) -> None:
    response = admin_client.post(reverse('admin:recipes_cuisine_add'), {'name': 'Ethiopian', 'slug': 'ethiopian'})

    assert response.status_code == 302
    names = [cuisine['name'] for cuisine in APIClient().get(reverse('cuisine-list')).json()]
    assert names[names.index('Chinese') : names.index('French') + 1] == ['Chinese', 'Ethiopian', 'French']


CATALOGUE_NOTICE = 'it changes through <code>backend/recipes/catalogue.json</code> in a PR'


# One row of each model in the admin, by its admin URL name, with the name it's shown by.
def admin_row(model: str) -> tuple[int, str]:
    rows = {
        'recipe': lambda: make_recipe(title='Shakshuka'),
        'ingredient': lambda: ingredient('courgette'),
        'equipment': lambda: Equipment.objects.get(slug='oven'),
        'cuisine': lambda: Cuisine.objects.get(slug='italian'),
    }
    row = rows[model]()
    return row.pk, str(row)


@pytest.mark.django_db
@pytest.mark.parametrize(
    ('model', 'status_code'), [('recipe', 403), ('ingredient', 403), ('equipment', 403), ('cuisine', 200)]
)
def test_the_admin_lets_staff_add_cuisines_but_not_to_the_catalogue(
    admin_client: Client, model: str, status_code: int
) -> None:
    response = admin_client.get(reverse(f'admin:recipes_{model}_add'))

    assert response.status_code == status_code


@pytest.mark.django_db
@pytest.mark.parametrize('model', ['recipe', 'ingredient', 'equipment'])
def test_the_admin_refuses_to_change_or_delete_the_catalogue(admin_client: Client, model: str) -> None:
    pk, name = admin_row(model)

    change = admin_client.post(
        reverse(f'admin:recipes_{model}_change', args=[pk]), {'title': 'Edited', 'name': 'Edited'}
    )
    delete = admin_client.post(reverse(f'admin:recipes_{model}_delete', args=[pk]), {'post': 'yes'})
    changelist = admin_client.get(reverse(f'admin:recipes_{model}_changelist'))

    assert (change.status_code, delete.status_code) == (403, 403)
    assert name in changelist.content.decode()
    assert 'Edited' not in changelist.content.decode()


@pytest.mark.django_db
@pytest.mark.parametrize(
    ('model', 'shown_by', 'says_where_it_changes'),
    [('recipe', 'title', True), ('ingredient', 'name', True), ('equipment', 'name', True), ('cuisine', 'name', False)],
)
def test_the_catalogue_pages_in_the_admin_show_each_row_read_only_and_say_where_it_changes(
    admin_client: Client, model: str, shown_by: str, says_where_it_changes: bool
) -> None:
    pk, name = admin_row(model)

    changelist = admin_client.get(reverse(f'admin:recipes_{model}_changelist')).content.decode()
    change = admin_client.get(reverse(f'admin:recipes_{model}_change', args=[pk])).content.decode()

    assert name in change
    assert (CATALOGUE_NOTICE in changelist, CATALOGUE_NOTICE in change) == (says_where_it_changes,) * 2
    assert (f'name="{shown_by}"' in change) is not says_where_it_changes


@pytest.mark.django_db
def test_the_recipe_list_in_the_admin_shows_catalogue_recipes_only(admin_client: Client) -> None:
    make_recipe(title='Shakshuka')
    make_recipe(title="Grandma's curry", household=Household.objects.create(name='The Quillfeathers'))

    page = admin_client.get(reverse('admin:recipes_recipe_changelist')).content.decode()

    assert ('Shakshuka' in page, 'Grandma&#x27;s curry' in page) == (True, False)


@pytest.mark.django_db
def test_the_recipe_page_in_the_admin_shows_its_ingredients_and_method_read_only(admin_client: Client) -> None:
    recipe = make_recipe(title='Shakshuka', source_url='https://en.wikibooks.org/wiki/Cookbook:Shakshouka')
    sauce = IngredientGroup.objects.create(recipe=recipe, name='For the sauce')
    add_line(recipe, 'chopped tomatoes', group=sauce, amount=Decimal(1), unit='tin')
    Step.objects.create(recipe=recipe, text='Crack in the eggs and cover.')

    response = admin_client.get(reverse('admin:recipes_recipe_change', args=[recipe.id]))

    page = response.content.decode()
    assert response.status_code == 200
    assert ['For the sauce' in page, 'chopped tomatoes' in page, 'Crack in the eggs and cover.' in page] == [True] * 3
    assert ['Source address' in page, 'https://en.wikibooks.org/wiki/Cookbook:Shakshouka' in page] == [True] * 2
    assert ['name="steps-0-text"' in page, 'name="ingredient_lines-0-amount"' in page, 'name="_save"' in page] == [
        False
    ] * 3


@pytest.mark.django_db
def test_returns_each_recipes_cuisines_alphabetically() -> None:
    recipe = make_recipe(title='Ramen tacos')
    recipe.cuisines.add(Cuisine.objects.get(slug='mexican'))
    recipe.cuisines.add(Cuisine.objects.get(slug='japanese'))

    response = APIClient().get(reverse('recipe-list'))

    assert response.json()[0]['cuisines'] == [
        {'slug': 'japanese', 'name': 'Japanese'},
        {'slug': 'mexican', 'name': 'Mexican'},
    ]


@pytest.mark.django_db
@pytest.mark.parametrize(
    ('params', 'titles'),
    [
        ({'cuisine': 'japanese'}, ['Ramen tacos', 'Sushi']),
        ({'cuisine': 'mexican'}, ['Ramen tacos']),
        ({'cuisine': 'italian'}, []),
        ({'cuisine': 'klingon'}, ['Apple tart', 'Banana bread', 'Ramen tacos', 'Sushi']),
        ({'cuisine': ''}, ['Apple tart', 'Banana bread', 'Ramen tacos', 'Sushi']),
        ({'cuisine': 'japanese', 'q': 'ramen'}, ['Ramen tacos']),
        ({'cuisine': 'french', 'q': 'ramen'}, []),
    ],
)
def test_filters_by_cuisine_and_combines_with_the_search(params: dict[str, str], titles: list[str]) -> None:
    for title, slugs in [
        ('Apple tart', ['french']),
        ('Ramen tacos', ['japanese', 'mexican']),
        ('Sushi', ['japanese']),
        ('Banana bread', []),
    ]:
        make_recipe(title=title).cuisines.set(Cuisine.objects.filter(slug__in=slugs))

    response = APIClient().get(reverse('recipe-list'), params)

    assert response.status_code == 200
    assert [recipe['title'] for recipe in response.json()] == titles


@pytest.mark.django_db
def test_lists_recipes_with_their_cuisines_and_diet_tags_in_three_queries(
    django_assert_num_queries: DjangoAssertNumQueries,
) -> None:
    for title in ['Apple tart', 'Ramen tacos', 'Sushi']:
        recipe = make_recipe(title=title)
        recipe.cuisines.set(Cuisine.objects.filter(slug__in=['french', 'japanese']))
        add_line(recipe, 'rice')
        add_line(recipe, 'butter', optional=True)

    with django_assert_num_queries(3):
        response = APIClient().get(reverse('recipe-list'))

    assert response.status_code == 200
    assert [(len(recipe['cuisines']), len(recipe['diet_tags'])) for recipe in response.json()] == [(2, 4)] * 3


ALL_FIVE = ['Apple tart', 'Greek salad', 'Pad thai', 'Ramen tacos', 'Risotto']


@pytest.mark.django_db
@pytest.mark.parametrize(
    ('params', 'titles'),
    [
        ('cuisine=italian&cuisine=thai', ['Pad thai', 'Risotto']),
        ('cuisine=japanese&cuisine=mexican', ['Ramen tacos']),
        ('cuisine=italian&cuisine=klingon', ['Risotto']),
        ('course=side', ['Greek salad', 'Ramen tacos']),
        ('course=main&course=side', ['Greek salad', 'Pad thai', 'Ramen tacos', 'Risotto']),
        ('course=brunch', ALL_FIVE),
        ('difficulty=easy&difficulty=hard', ['Greek salad', 'Pad thai', 'Ramen tacos']),
        ('max_total=15', ['Greek salad']),
        ('max_total=40', ['Greek salad', 'Pad thai']),
        ('max_total=45', ['Greek salad', 'Pad thai', 'Risotto']),
        ('max_prep=15', ['Greek salad', 'Pad thai', 'Risotto']),
        ('max_cook=15', ['Greek salad', 'Pad thai']),
        ('one_pot=true', ['Pad thai', 'Risotto']),
        ('one_pot=false', ALL_FIVE),
        ('cuisine=italian&cuisine=thai&max_total=30', ['Pad thai']),
        ('course=main&difficulty=medium', ['Risotto']),
        ('q=pad&one_pot=true', ['Pad thai']),
    ],
)
def test_filters_the_list_and_combines_the_filters(params: str, titles: list[str]) -> None:
    for title, cuisines, courses, difficulty, prep, cook, extra, extra_label, one_pot in [
        ('Apple tart', ['french'], ['dessert'], 'medium', 30, 40, 30, 'chilling', False),
        ('Greek salad', ['greek'], ['side'], 'easy', 15, 0, 0, '', False),
        ('Pad thai', ['thai'], ['main'], 'easy', 15, 15, 0, '', True),
        ('Ramen tacos', ['japanese', 'mexican'], ['main', 'side'], 'hard', 30, 30, 0, '', False),
        ('Risotto', ['italian'], ['main'], 'medium', 10, 30, 5, 'resting', True),
    ]:
        recipe = make_recipe(
            title=title,
            difficulty=difficulty,
            prep_minutes=prep,
            cook_minutes=cook,
            extra_minutes=extra,
            extra_label=extra_label,
            one_pot=one_pot,
        )
        recipe.cuisines.set(Cuisine.objects.filter(slug__in=cuisines))
        recipe.courses.set(Course.objects.filter(slug__in=courses))

    response = APIClient().get(f'{reverse("recipe-list")}?{params}')

    assert response.status_code == 200
    assert [recipe['title'] for recipe in response.json()] == titles


@pytest.mark.django_db
@pytest.mark.parametrize(
    ('params', 'parameter'),
    [
        ('max_total=abc', 'max_total'),
        ('max_prep=0', 'max_prep'),
        ('difficulty=eazy', 'difficulty'),
        ('diet=halal', 'diet'),
        ('include_match=both', 'include_match'),
    ],
)
def test_refuses_a_malformed_filter(params: str, parameter: str) -> None:
    response = APIClient().get(f'{reverse("recipe-list")}?{params}')

    assert response.status_code == 400
    assert list(response.json()) == [parameter]


@pytest.mark.django_db
def test_filters_with_cuisines_and_courses_in_five_queries(django_assert_num_queries: DjangoAssertNumQueries) -> None:
    for title, cuisine, course in [
        ('Apple tart', 'french', 'dessert'),
        ('Coq au vin', 'french', 'main'),
        ('Risotto', 'italian', 'main'),
    ]:
        recipe = make_recipe(title=title)
        recipe.cuisines.set(Cuisine.objects.filter(slug=cuisine))
        recipe.courses.set(Course.objects.filter(slug=course))

    # One existence check each for the cuisines and the courses, the list, then the cuisines and diet tags prefetches.
    with django_assert_num_queries(5):
        response = APIClient().get(reverse('recipe-list'), {'cuisine': 'french', 'course': 'main'})

    assert response.status_code == 200
    assert [recipe['title'] for recipe in response.json()] == ['Coq au vin']


ALL_SIX = ['Bread pudding', 'Chana masala', 'Cheese on toast', 'Herb salad', 'Pad thai', 'Satay tofu']


# Six recipes whose diet tags and ingredients the diet and ingredient filter tests pick between.
def make_diet_recipes() -> None:
    bread = flagged('bread', 'contains_gluten')
    butter = flagged('butter', 'contains_dairy')
    eggs = flagged('eggs', 'contains_egg')
    yoghurt = flagged('yoghurt', 'contains_dairy')
    cheddar = flagged('cheddar', 'contains_dairy')
    fish_sauce = flagged('fish sauce', 'contains_fish')
    soy_sauce = flagged('soy sauce', 'contains_gluten')
    chickpeas, onion, peanuts = ingredient('chickpeas'), ingredient('onion'), ingredient('peanuts')
    rice_noodles, tofu = ingredient('rice noodles'), ingredient('tofu')
    for title, required, optional in [
        ('Bread pudding', [bread, butter, eggs], []),
        ('Chana masala', [chickpeas, onion], [yoghurt]),
        ('Cheese on toast', [bread, cheddar], []),
        ('Herb salad', [], [peanuts]),
        ('Pad thai', [rice_noodles, peanuts, fish_sauce], []),
        ('Satay tofu', [tofu, peanuts, soy_sauce], []),
    ]:
        recipe = make_recipe(title=title)
        for used in required:
            IngredientLine.objects.create(recipe=recipe, ingredient=used)
        for used in optional:
            IngredientLine.objects.create(recipe=recipe, ingredient=used, optional=True)


@pytest.mark.django_db
@pytest.mark.parametrize(
    ('params', 'titles'),
    [
        ('diet=vegan', ['Chana masala', 'Satay tofu']),
        ('diet=vegetarian', ['Bread pudding', 'Chana masala', 'Cheese on toast', 'Satay tofu']),
        ('diet=gluten_free', ['Chana masala', 'Pad thai']),
        ('diet=dairy_free', ['Chana masala', 'Pad thai', 'Satay tofu']),
        ('diet=vegetarian&diet=dairy_free', ['Chana masala', 'Satay tofu']),
        ('diet=vegan&diet=gluten_free', ['Chana masala']),
        ('include_ingredient=peanuts', ['Herb salad', 'Pad thai', 'Satay tofu']),
        (
            'include_ingredient=peanuts&include_ingredient=cheddar',
            ['Cheese on toast', 'Herb salad', 'Pad thai', 'Satay tofu'],
        ),
        ('include_ingredient=peanuts&include_ingredient=klingon', ['Herb salad', 'Pad thai', 'Satay tofu']),
        ('include_ingredient=klingon', ALL_SIX),
        (
            'include_ingredient=peanuts&include_ingredient=soy-sauce&include_match=any',
            ['Herb salad', 'Pad thai', 'Satay tofu'],
        ),
        ('include_ingredient=peanuts&include_ingredient=soy-sauce&include_match=all', ['Satay tofu']),
        ('include_ingredient=peanuts&include_ingredient=cheddar&include_match=all', []),
        ('include_ingredient=chickpeas&include_ingredient=yoghurt&include_match=all', ['Chana masala']),
        (
            'include_ingredient=peanuts&include_ingredient=klingon&include_match=all',
            ['Herb salad', 'Pad thai', 'Satay tofu'],
        ),
        ('include_ingredient=klingon&include_match=all', ALL_SIX),
        ('include_match=all', ALL_SIX),
        ('exclude_ingredient=peanuts', ['Bread pudding', 'Chana masala', 'Cheese on toast']),
        ('exclude_ingredient=yoghurt', ['Bread pudding', 'Cheese on toast', 'Herb salad', 'Pad thai', 'Satay tofu']),
        ('exclude_ingredient=peanuts&exclude_ingredient=bread', ['Chana masala']),
        ('exclude_ingredient=klingon', ALL_SIX),
        ('include_ingredient=peanuts&exclude_ingredient=fish-sauce', ['Herb salad', 'Satay tofu']),
        ('diet=vegan&exclude_ingredient=peanuts', ['Chana masala']),
        ('diet=vegetarian&include_ingredient=bread', ['Bread pudding', 'Cheese on toast']),
        ('q=tofu&diet=vegan', ['Satay tofu']),
    ],
)
def test_filters_by_diet_and_ingredients(params: str, titles: list[str]) -> None:
    make_diet_recipes()

    response = APIClient().get(f'{reverse("recipe-list")}?{params}')

    assert response.status_code == 200
    assert [recipe['title'] for recipe in response.json()] == titles


@pytest.mark.django_db
def test_the_vegetarian_filter_leaves_out_a_recipe_with_cheese_made_with_animal_rennet() -> None:
    parmesan = flagged('parmesan', 'contains_dairy', 'contains_animal_rennet')
    mozzarella = flagged('mozzarella', 'contains_dairy')
    for title, cheese in [('Pesto pasta', parmesan), ('Caprese salad', mozzarella)]:
        IngredientLine.objects.create(recipe=make_recipe(title=title), ingredient=cheese)

    response = APIClient().get(reverse('recipe-list'), {'diet': 'vegetarian'})

    assert [recipe['title'] for recipe in response.json()] == ['Caprese salad']


@pytest.mark.django_db
@pytest.mark.parametrize('diet', ['vegetarian', 'vegan', 'gluten_free', 'dairy_free'])
def test_the_diet_filter_agrees_with_each_recipes_diet_tags(diet: str) -> None:
    make_diet_recipes()

    every_recipe = APIClient().get(reverse('recipe-list')).json()
    filtered = APIClient().get(reverse('recipe-list'), {'diet': diet}).json()

    tagged = [recipe['title'] for recipe in every_recipe if diet in recipe['diet_tags']]
    assert tagged != []
    assert [recipe['title'] for recipe in filtered] == tagged


@pytest.mark.django_db
def test_filters_by_diet_and_ingredients_in_four_queries(django_assert_num_queries: DjangoAssertNumQueries) -> None:
    make_diet_recipes()

    # The included ingredients' existence check, the list, then the cuisines and diet tags prefetches.
    with django_assert_num_queries(4):
        response = APIClient().get(
            reverse('recipe-list'),
            {'diet': 'vegan', 'include_ingredient': 'peanuts', 'exclude_ingredient': 'bread'},
        )

    assert response.status_code == 200
    assert [recipe['title'] for recipe in response.json()] == ['Satay tofu']


@pytest.mark.django_db
def test_filters_by_all_included_ingredients_in_four_queries(
    django_assert_num_queries: DjangoAssertNumQueries,
) -> None:
    make_diet_recipes()

    # The included ingredients, the list, then the cuisines and diet tags prefetches.
    with django_assert_num_queries(4):
        response = APIClient().get(
            reverse('recipe-list'),
            {'include_ingredient': ['peanuts', 'tofu', 'soy-sauce'], 'include_match': 'all'},
        )

    assert response.status_code == 200
    assert [recipe['title'] for recipe in response.json()] == ['Satay tofu']


@pytest.mark.django_db
def test_lists_every_ingredient_alphabetically_with_its_synonyms() -> None:
    ingredient('butter')
    aubergine = ingredient('aubergine')
    for name in ['eggplant', 'brinjal']:
        IngredientSynonym.objects.create(ingredient=aubergine, name=name)

    response = APIClient().get(reverse('ingredient-list'))

    assert response.status_code == 200
    assert response.json() == [
        {'slug': 'aubergine', 'name': 'aubergine', 'synonyms': ['brinjal', 'eggplant']},
        {'slug': 'butter', 'name': 'butter', 'synonyms': []},
    ]


@pytest.mark.django_db
def test_lists_ingredients_in_two_queries(django_assert_num_queries: DjangoAssertNumQueries) -> None:
    for name in ['aubergine', 'coriander', 'courgette']:
        used = ingredient(name)
        for synonym in ['one', 'two']:
            IngredientSynonym.objects.create(ingredient=used, name=f'{name} {synonym}')

    with django_assert_num_queries(2):
        response = APIClient().get(reverse('ingredient-list'))

    assert response.status_code == 200
    assert len(response.json()) == 3


@pytest.mark.django_db
def test_returns_a_yield_instead_of_servings() -> None:
    make_recipe(title='Oat cookies', servings=None, yield_amount=12, yield_unit='cookies')

    response = APIClient().get(reverse('recipe-detail', args=['oat-cookies']))

    assert {key: response.json()[key] for key in ['servings', 'yield_amount', 'yield_unit']} == {
        'servings': None,
        'yield_amount': 12,
        'yield_unit': 'cookies',
    }


@pytest.mark.django_db
@pytest.mark.parametrize(
    ('prep_minutes', 'cook_minutes', 'extra_minutes', 'extra_label', 'total_minutes'),
    [
        (10, 20, 0, '', 30),
        (15, 0, 0, '', 15),
        (0, 0, 0, '', 0),
        (20, 45, 120, 'marinating', 185),
        (None, 20, 0, '', None),
        (10, None, 0, '', None),
    ],
)
def test_total_time_is_prep_plus_cook_plus_extra(
    prep_minutes: int | None, cook_minutes: int | None, extra_minutes: int, extra_label: str, total_minutes: int | None
) -> None:
    # A household's recipe, as only those may leave a time out.
    household = Household.objects.create(name='The Quillfeathers')
    make_recipe(
        title='Shakshuka',
        household=household,
        prep_minutes=prep_minutes,
        cook_minutes=cook_minutes,
        extra_minutes=extra_minutes,
        extra_label=extra_label,
    )
    member = APIClient()
    member.force_login(User.objects.create_user('milo@example.com', name='Milo', household=household))

    listed = member.get(reverse('recipe-list')).json()[0]
    detail = member.get(reverse('recipe-detail', args=['shakshuka'])).json()

    assert (listed['total_minutes'], detail['total_minutes']) == (total_minutes, total_minutes)


@pytest.mark.django_db
def test_returns_a_recipe_with_its_details_ingredients_method_and_diet_tags_in_eight_queries(
    django_assert_num_queries: DjangoAssertNumQueries,
) -> None:
    recipe = make_recipe(title='Shakshuka')
    recipe.cuisines.set(Cuisine.objects.filter(slug__in=['french', 'japanese']))
    recipe.courses.set(Course.objects.filter(slug__in=['main', 'side']))
    recipe.equipment.set(Equipment.objects.filter(slug__in=['oven', 'hob']))
    sauce = IngredientGroup.objects.create(recipe=recipe, name='For the sauce')
    to_serve = IngredientGroup.objects.create(recipe=recipe, name='To serve')
    for group, name in [(None, 'egg'), (None, 'salt'), (sauce, 'tomato'), (sauce, 'onion'), (to_serve, 'feta')]:
        add_line(recipe, name, group=group)
    for text in ['Fry the onion.', 'Add the tomatoes.', 'Crack in the eggs.']:
        Step.objects.create(recipe=recipe, text=text)

    with django_assert_num_queries(8):
        response = APIClient().get(reverse('recipe-detail', args=['shakshuka']))

    body = response.json()
    assert [len(body[key]) for key in ['cuisines', 'courses', 'equipment', 'ingredient_lines', 'steps']] == [
        2,
        2,
        2,
        2,
        3,
    ]
    assert [len(group['lines']) for group in body['ingredient_groups']] == [2, 1]


@pytest.mark.django_db
def test_returns_the_ingredients_with_ungrouped_lines_first_then_each_group_and_the_method_in_order() -> None:
    recipe = make_recipe(title='Shakshuka')
    # Created out of order, so only position can put them right.
    to_serve = IngredientGroup.objects.create(recipe=recipe, name='To serve', position=2)
    sauce = IngredientGroup.objects.create(recipe=recipe, name='For the sauce', position=1)
    feta = add_line(recipe, 'feta', group=to_serve, amount=Decimal(50), unit='g', note='crumbled')
    chilli = add_line(recipe, 'chilli flakes', group=to_serve, position=1, optional=True)
    tomatoes = add_line(
        recipe,
        'chopped tomatoes',
        group=sauce,
        position=1,
        amount=Decimal(1),
        unit='tin',
        original_text='1 tin of chopped tomatoes',
    )
    onion = add_line(recipe, 'onion', group=sauce, amount=Decimal(1), note='finely chopped')
    salt = add_line(recipe, 'salt', position=2, note='to taste')
    eggs = add_line(recipe, 'egg', position=1, amount=Decimal(2), amount_max=Decimal(3))
    oil = add_line(recipe, 'olive oil', amount=Decimal('1.5'), unit='tbsp')
    crack = Step.objects.create(recipe=recipe, position=3, text='Crack in the eggs and cover.')
    fry = Step.objects.create(recipe=recipe, position=1, text='Fry the onion in the oil until soft.')
    simmer = Step.objects.create(recipe=recipe, position=2, text='Add the tomatoes and simmer for 10 minutes.')

    response = APIClient().get(reverse('recipe-detail', args=['shakshuka']))

    def line(row: IngredientLine, slug: str, name: str, **fields: Any) -> dict[str, Any]:
        return {
            'id': row.id,
            'amount': None,
            'amount_max': None,
            'unit': '',
            'ingredient': {'slug': slug, 'name': name, 'grams_per_cup': None, 'awaiting_review': False},
            'note': '',
            'optional': False,
            'original_text': '',
            **fields,
        }

    body = response.json()
    assert body['ingredient_lines'] == [
        line(oil, 'olive-oil', 'olive oil', amount=1.5, unit='tbsp'),
        line(eggs, 'egg', 'egg', amount=2.0, amount_max=3.0),
        line(salt, 'salt', 'salt', note='to taste'),
    ]
    assert body['ingredient_groups'] == [
        {
            'id': sauce.id,
            'name': 'For the sauce',
            'lines': [
                line(onion, 'onion', 'onion', amount=1.0, note='finely chopped'),
                line(
                    tomatoes,
                    'chopped-tomatoes',
                    'chopped tomatoes',
                    amount=1.0,
                    unit='tin',
                    original_text='1 tin of chopped tomatoes',
                ),
            ],
        },
        {
            'id': to_serve.id,
            'name': 'To serve',
            'lines': [
                line(feta, 'feta', 'feta', amount=50.0, unit='g', note='crumbled'),
                line(chilli, 'chilli-flakes', 'chilli flakes', optional=True),
            ],
        },
    ]
    assert body['steps'] == [
        {'id': fry.id, 'text': 'Fry the onion in the oil until soft.'},
        {'id': simmer.id, 'text': 'Add the tomatoes and simmer for 10 minutes.'},
        {'id': crack.id, 'text': 'Crack in the eggs and cover.'},
    ]


PHOTO = {
    'photo_url': 'https://upload.wikimedia.org/wikipedia/commons/7/7e/Shakshuka_%28Tel_Aviv%29.jpg',
    'photo_author': 'Jane Doe',
    'photo_licence': 'CC BY-SA 4.0',
    'photo_source_url': 'https://commons.wikimedia.org/wiki/File:Shakshuka_(Tel_Aviv).jpg',
}

PHOTO_IN_THE_API = {
    'url': 'https://upload.wikimedia.org/wikipedia/commons/7/7e/Shakshuka_%28Tel_Aviv%29.jpg',
    'thumbnails': [
        {
            'width': width,
            'url': 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7e/Shakshuka_%28Tel_Aviv%29.jpg/'
            f'{width}px-Shakshuka_%28Tel_Aviv%29.jpg',
        }
        for width in [330, 500, 960, 1280]
    ],
    'credit': {
        'author': 'Jane Doe',
        'licence': 'CC BY-SA 4.0',
        'source_url': 'https://commons.wikimedia.org/wiki/File:Shakshuka_(Tel_Aviv).jpg',
    },
}


@pytest.mark.django_db
def test_lists_and_returns_a_recipes_photo_with_its_thumbnails_and_credit_or_null_without_one() -> None:
    make_recipe(title='Shakshuka', **PHOTO)
    make_recipe(title='Apple tart')

    listed = APIClient().get(reverse('recipe-list')).json()
    details = [APIClient().get(reverse('recipe-detail', args=[slug])).json() for slug in ['apple-tart', 'shakshuka']]

    assert [(recipe['title'], recipe['photo']) for recipe in listed] == [
        ('Apple tart', None),
        ('Shakshuka', PHOTO_IN_THE_API),
    ]
    assert [(recipe['title'], recipe['photo']) for recipe in details] == [
        ('Apple tart', None),
        ('Shakshuka', PHOTO_IN_THE_API),
    ]


def flagged(name: str, *flags: str) -> Ingredient:
    return Ingredient.objects.create(name=name, slug=name.replace(' ', '-'), **dict.fromkeys(flags, True))


@pytest.mark.django_db
@pytest.mark.parametrize(
    ('flags', 'diet_tags'),
    [
        ((), ['vegetarian', 'vegan', 'gluten_free', 'dairy_free']),
        (('contains_meat',), ['gluten_free', 'dairy_free']),
        (('contains_fish',), ['gluten_free', 'dairy_free']),
        (('contains_dairy',), ['vegetarian', 'gluten_free']),
        (('contains_egg',), ['vegetarian', 'gluten_free', 'dairy_free']),
        (('contains_other_animal_product',), ['vegetarian', 'gluten_free', 'dairy_free']),
        (('contains_animal_rennet',), ['gluten_free', 'dairy_free']),
        (('contains_gluten',), ['vegetarian', 'vegan', 'dairy_free']),
        (('contains_dairy', 'contains_gluten'), ['vegetarian']),
    ],
)
def test_works_out_the_diet_tags_from_what_every_ingredient_contains(
    flags: tuple[str, ...], diet_tags: list[str]
) -> None:
    recipe = make_recipe(title='Risotto')
    add_line(recipe, 'rice')
    sauce = IngredientGroup.objects.create(recipe=recipe, name='For the sauce')
    IngredientLine.objects.create(recipe=recipe, group=sauce, ingredient=flagged('stock', *flags))

    listed = APIClient().get(reverse('recipe-list')).json()[0]
    detail = APIClient().get(reverse('recipe-detail', args=['risotto'])).json()

    assert (listed['diet_tags'], detail['diet_tags']) == (diet_tags, diet_tags)


@pytest.mark.django_db
@pytest.mark.parametrize(
    ('lines', 'diet_tags'),
    [
        ([], []),
        ([('rice', True)], []),
        ([('rice', False)], ['vegetarian', 'vegan', 'gluten_free', 'dairy_free']),
    ],
)
def test_claims_no_diet_until_the_recipe_has_a_required_ingredient(
    lines: list[tuple[str, bool]], diet_tags: list[str]
) -> None:
    recipe = make_recipe(title='Risotto')
    for name, optional in lines:
        add_line(recipe, name, optional=optional)

    detail = APIClient().get(reverse('recipe-detail', args=['risotto'])).json()

    assert detail['diet_tags'] == diet_tags


@pytest.mark.django_db
def test_optional_lines_keep_the_diet_tags_and_name_the_ones_they_would_take_away() -> None:
    recipe = make_recipe(title='Spaghetti aglio e olio')
    IngredientLine.objects.create(recipe=recipe, ingredient=flagged('spaghetti', 'contains_gluten'))
    add_line(recipe, 'garlic')
    bacon = flagged('bacon', 'contains_meat')
    IngredientLine.objects.create(recipe=recipe, ingredient=bacon, optional=True)
    to_serve = IngredientGroup.objects.create(recipe=recipe, name='To serve')
    parmesan = flagged('parmesan', 'contains_dairy', 'contains_animal_rennet')
    IngredientLine.objects.create(recipe=recipe, group=to_serve, ingredient=parmesan, optional=True)
    IngredientLine.objects.create(recipe=recipe, group=to_serve, ingredient=parmesan, optional=True, note='to grate')
    # Gluten-free isn't one of the recipe's tags, so an optional crouton takes nothing away.
    IngredientLine.objects.create(
        recipe=recipe, group=to_serve, ingredient=flagged('croutons', 'contains_gluten'), optional=True
    )
    add_line(recipe, 'parsley', optional=True)

    listed = APIClient().get(reverse('recipe-list')).json()[0]
    detail = APIClient().get(reverse('recipe-detail', args=['spaghetti-aglio-e-olio'])).json()

    assert listed['diet_tags'] == ['vegetarian', 'vegan', 'dairy_free']
    assert detail['diet_tags'] == ['vegetarian', 'vegan', 'dairy_free']
    assert detail['diet_tag_conflicts'] == [
        {
            'ingredient': {'slug': 'bacon', 'name': 'bacon', 'grams_per_cup': None, 'awaiting_review': False},
            'diet_tags': ['vegetarian', 'vegan'],
        },
        {
            'ingredient': {'slug': 'parmesan', 'name': 'parmesan', 'grams_per_cup': None, 'awaiting_review': False},
            'diet_tags': ['vegetarian', 'vegan', 'dairy_free'],
        },
    ]
