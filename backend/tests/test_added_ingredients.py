import re
from collections.abc import Callable
from typing import Any

import pytest
from django.http import HttpResponse
from django.test import Client
from django.urls import reverse

from recipes.models import Ingredient, IngredientSynonym
from tests.test_accounts import BrowserClient, sign_up
from tests.test_editing_recipes import MILO, add, ben_in_milos_household
from tests.test_household import signed_up
from tests.test_recipes import CATALOGUE_NOTICE, ingredient

INGREDIENTS = '/api/ingredients/'
JO = 'jo@example.com'


def add_ingredient(browser: BrowserClient, name: str) -> HttpResponse:
    return browser.client.post(INGREDIENTS, {'name': name}, format='json', **browser.csrf_header())


def line(slug: str, **fields: Any) -> dict[str, Any]:
    return {
        'amount': None,
        'amount_max': None,
        'unit': '',
        'ingredient': slug,
        'note': '',
        'optional': False,
        'original_text': '',
        **fields,
    }


def offered(browser: BrowserClient) -> list[str]:
    return [option['slug'] for option in browser.client.get(INGREDIENTS).json()]


def review(admin_client: Client, slug: str, *flags: str) -> HttpResponse:
    """Staff save an added ingredient's change page with these flags on, marked Reviewed."""
    found = Ingredient.objects.get(slug=slug)
    return admin_client.post(
        reverse('admin:recipes_ingredient_change', args=[found.pk]),
        {
            'name': found.name,
            'status': 'reviewed',
            'grams_per_cup': '',
            **dict.fromkeys(flags, 'on'),
            'synonyms-TOTAL_FORMS': '0',
            'synonyms-INITIAL_FORMS': '0',
        },
    )


def catalogue() -> None:
    courgette = ingredient('courgette')
    IngredientSynonym.objects.create(ingredient=courgette, name='zucchini')
    ingredient('crème fraîche')
    ingredient('olive oil')


@pytest.mark.django_db
def test_a_member_adds_an_ingredient_the_list_doesnt_have_by_the_name_they_typed() -> None:
    milo = signed_up(MILO, 'Milo')

    response = add_ingredient(milo, '  Chipotle   paste ')

    assert (response.status_code, response.json()) == (
        201,
        {'slug': 'chipotle-paste', 'name': 'Chipotle paste', 'synonyms': []},
    )
    assert Ingredient.objects.get(slug='chipotle-paste').status == 'awaiting_review'


@pytest.mark.django_db
@pytest.mark.parametrize(
    ('name', 'slug'), [('Courgette', 'courgette'), ('zucchini', 'courgette'), ('creme fraiche', 'crème-fraîche')]
)
def test_adding_a_name_or_synonym_the_list_has_gives_that_ingredient(name: str, slug: str) -> None:
    catalogue()
    milo = signed_up(MILO, 'Milo')
    count = Ingredient.objects.count()

    response = add_ingredient(milo, name)

    assert (response.status_code, response.json()['slug']) == (200, slug)
    assert Ingredient.objects.count() == count


@pytest.mark.django_db
def test_adding_a_name_someone_else_added_gives_theirs() -> None:
    add_ingredient(signed_up(MILO, 'Milo'), 'Chipotle paste')

    response = add_ingredient(signed_up(JO, 'Jo'), 'chipotle paste')

    assert (response.status_code, response.json()['slug']) == (200, 'chipotle-paste')


@pytest.mark.django_db
def test_an_added_ingredient_whose_slug_is_taken_gets_the_next_free_one() -> None:
    ingredient('chilli')

    response = add_ingredient(signed_up(MILO, 'Milo'), 'chilli!')

    assert (response.status_code, response.json()['slug']) == (201, 'chilli-2')


@pytest.mark.django_db
@pytest.mark.parametrize(
    ('name', 'message'),
    [
        ('', "Type the ingredient's name."),
        ('   ', "Type the ingredient's name."),
        ('123', 'Give the ingredient a name with a letter in it.'),
        ('a' * 101, 'Give a name of 100 characters or fewer.'),
    ],
)
def test_a_name_an_ingredient_cant_have_is_refused(name: str, message: str) -> None:
    milo = signed_up(MILO, 'Milo')
    count = Ingredient.objects.count()

    response = add_ingredient(milo, name)

    assert (response.status_code, response.json()) == (400, {'name': [message]})
    assert Ingredient.objects.count() == count


def signed_out() -> HttpResponse:
    return add_ingredient(BrowserClient(), 'Chipotle paste')


def without_the_csrf_header() -> HttpResponse:
    milo = signed_up(MILO, 'Milo')
    return milo.client.post(INGREDIENTS, {'name': 'Chipotle paste'}, format='json')


def with_no_household() -> HttpResponse:
    browser = BrowserClient()
    sign_up(browser, MILO)
    return add_ingredient(browser, 'Chipotle paste')


@pytest.mark.django_db
@pytest.mark.parametrize('attempt', [signed_out, without_the_csrf_header, with_no_household])
def test_only_a_member_of_a_household_can_add_an_ingredient(attempt: Callable[[], HttpResponse]) -> None:
    response = attempt()

    assert response.status_code == 403
    assert not Ingredient.objects.filter(slug='chipotle-paste').exists()


def milos_chipotle_beans() -> BrowserClient:
    milo = signed_up(MILO, 'Milo')
    add_ingredient(milo, 'chipotle paste')
    add(milo, {'title': 'Chipotle beans', 'ingredient_lines': [line('chipotle-paste')]})
    return milo


@pytest.mark.django_db
@pytest.mark.parametrize(
    ('who', 'is_offered'),
    [
        (lambda milo: milo, True),
        (lambda _: ben_in_milos_household(), True),
        (lambda _: signed_up(JO, 'Jo'), False),
        (lambda _: BrowserClient(), False),
    ],
    ids=['Milo', 'Ben in his household', 'Jo in another', 'signed out'],
)
def test_an_ingredient_awaiting_review_is_offered_only_to_households_using_it(
    who: Callable[[BrowserClient], BrowserClient], is_offered: bool
) -> None:
    ingredient('courgette')
    milo = milos_chipotle_beans()

    slugs = offered(who(milo))

    assert ('chipotle-paste' in slugs, 'courgette' in slugs) == (is_offered, True)


@pytest.mark.django_db
def test_an_ingredient_awaiting_review_that_no_recipe_uses_is_offered_to_nobody() -> None:
    milo = signed_up(MILO, 'Milo')
    add_ingredient(milo, 'gochujang')
    ingredient('courgette')

    assert offered(milo) == ['courgette']


@pytest.mark.django_db
def test_a_reviewed_ingredient_is_offered_to_everyone(admin_client: Client) -> None:
    milos_chipotle_beans()

    review(admin_client, 'chipotle-paste')

    assert 'chipotle-paste' in offered(signed_up(JO, 'Jo'))


def tags_seen_by(milo: BrowserClient, slug: str) -> dict[str, Any]:
    detail = milo.client.get(f'/api/recipes/{slug}/').json()
    listed = milo.client.get('/api/recipes/').json()[0]
    vegan = [recipe['slug'] for recipe in milo.client.get('/api/recipes/?diet=vegan').json()]
    return {
        'diet_tags': (detail['diet_tags'], listed['diet_tags']),
        'diet_tag_conflicts': detail['diet_tag_conflicts'],
        'awaiting_review': detail['ingredient_lines'][1]['ingredient']['awaiting_review'],
        'vegan': slug in vegan,
    }


def olive_oil_and_chipotle(optional: bool) -> tuple[BrowserClient, str]:
    ingredient('olive oil')
    milo = signed_up(MILO, 'Milo')
    add_ingredient(milo, 'chipotle paste')
    slug = add(
        milo,
        {'title': 'Chipotle beans', 'ingredient_lines': [line('olive-oil'), line('chipotle-paste', optional=optional)]},
    )
    return milo, slug


@pytest.mark.django_db
@pytest.mark.parametrize('optional', [False, True], ids=['required', 'optional'])
def test_a_recipe_using_an_ingredient_awaiting_review_claims_no_diet(optional: bool) -> None:
    milo, slug = olive_oil_and_chipotle(optional)

    assert tags_seen_by(milo, slug) == {
        'diet_tags': ([], []),
        'diet_tag_conflicts': [],
        'awaiting_review': True,
        'vegan': False,
    }


@pytest.mark.django_db
def test_once_reviewed_the_recipe_gets_the_diet_tags_its_ingredients_allow(admin_client: Client) -> None:
    milo, slug = olive_oil_and_chipotle(optional=False)

    reviewed = review(admin_client, 'chipotle-paste')

    every_tag = ['vegetarian', 'vegan', 'gluten_free', 'dairy_free']
    assert reviewed.status_code == 302
    assert tags_seen_by(milo, slug) == {
        'diet_tags': (every_tag, every_tag),
        'diet_tag_conflicts': [],
        'awaiting_review': False,
        'vegan': True,
    }


ADDED_NOTICE = 'Someone added this ingredient from a recipe. Set what it contains, then mark it Reviewed'


def chipotle_paste_added() -> int:
    """Milo adds chipotle paste from the recipe form; the ingredient's id."""
    add_ingredient(signed_up(MILO, 'Milo'), 'chipotle paste')
    return Ingredient.objects.get(slug='chipotle-paste').pk


@pytest.mark.django_db
def test_an_added_ingredients_page_in_the_admin_can_be_changed_and_says_what_to_review(admin_client: Client) -> None:
    pk = chipotle_paste_added()

    page = admin_client.get(reverse('admin:recipes_ingredient_change', args=[pk])).content.decode()

    status = re.search(r'<select name="status".*?</select>', page, re.DOTALL)
    assert status is not None
    assert re.findall(r'<option value="[^"]*"[^>]*>([^<]*)</option>', status.group()) == [
        'Awaiting review',
        'Reviewed',
    ]
    assert ['name="name"' in page, 'name="contains_meat"' in page, 'name="grams_per_cup"' in page] == [True] * 3
    assert (ADDED_NOTICE in page, CATALOGUE_NOTICE in page) == (True, False)


@pytest.mark.django_db
def test_staff_review_an_added_ingredient_in_the_admin(admin_client: Client) -> None:
    pk = chipotle_paste_added()

    response = review(admin_client, 'chipotle-paste', 'contains_dairy')

    assert response.status_code == 302
    assert Ingredient.objects.filter(pk=pk).values_list('contains_dairy', 'status').get() == (True, 'reviewed')


@pytest.mark.django_db
@pytest.mark.parametrize(('used', 'kept'), [(False, False), (True, True)], ids=['unused', 'used by a recipe'])
def test_staff_delete_an_added_ingredient_only_when_no_recipe_uses_it(
    admin_client: Client, used: bool, kept: bool
) -> None:
    pk = chipotle_paste_added()
    if used:
        add(signed_up(JO, 'Jo'), {'title': 'Chipotle beans', 'ingredient_lines': [line('chipotle-paste')]})

    admin_client.post(reverse('admin:recipes_ingredient_delete', args=[pk]), {'post': 'yes'})

    assert Ingredient.objects.filter(pk=pk).exists() is kept


@pytest.mark.django_db
def test_the_ingredient_list_in_the_admin_finds_the_ones_awaiting_review(admin_client: Client) -> None:
    chipotle_paste_added()
    ingredient('courgette')
    changelist = reverse('admin:recipes_ingredient_changelist')

    every = admin_client.get(changelist).content.decode()
    awaiting = admin_client.get(changelist, {'status__exact': 'awaiting_review'}).content.decode()

    assert (CATALOGUE_NOTICE in every, 'filter by status to find the ones awaiting review' in every) == (True, True)
    assert ('chipotle paste' in awaiting, 'courgette' in awaiting) == (True, False)
