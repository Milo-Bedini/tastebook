from collections.abc import Callable

import pytest
from django.http import HttpResponse

from households.models import User
from recipes.models import Ingredient, IngredientGroup, IngredientLine, IngredientStatus, Recipe, Step
from tests.test_accounts import BrowserClient, sign_up
from tests.test_added_ingredients import add_ingredient, line
from tests.test_editing_recipes import (
    BEN,
    CURRY,
    MILO,
    RECIPES,
    add,
    ben_in_milos_household,
    change,
    milos_curry,
    title_of,
)
from tests.test_household import signed_up
from tests.test_moving_recipes import is_removed, joins_jo, leaves
from tests.test_recipes import add_line, make_recipe


def remove_recipe(browser: BrowserClient, slug: str) -> HttpResponse:
    return browser.client.delete(f'{RECIPES}{slug}/', **browser.csrf_header())


def deleted_account(milo: BrowserClient, ben: BrowserClient) -> None:
    User.objects.get(email=MILO).delete()


@pytest.mark.django_db
def test_the_author_deletes_their_recipe_with_its_ingredients_and_method() -> None:
    milo, slug = milos_curry()
    curry = Recipe.objects.get(slug=slug)
    add_line(curry, 'onion')
    sauce = IngredientGroup.objects.create(recipe=curry, name='For the sauce')
    add_line(curry, 'tomato', group=sauce)
    Step.objects.create(recipe=curry, position=0, text='Fry the onions.')
    Step.objects.create(recipe=curry, position=1, text='Add the sauce.')

    response = remove_recipe(milo, slug)

    assert (response.status_code, response.content) == (204, b'')
    assert Recipe.objects.filter(slug=slug).exists() is False
    assert [
        IngredientLine.objects.filter(recipe_id=curry.pk).count(),
        IngredientGroup.objects.filter(recipe_id=curry.pk).count(),
        Step.objects.filter(recipe_id=curry.pk).count(),
    ] == [0, 0, 0]


@pytest.mark.django_db
def test_a_deleted_recipe_is_not_found() -> None:
    milo, slug = milos_curry()
    remove_recipe(milo, slug)

    response = milo.client.get(f'{RECIPES}{slug}/')

    assert response.status_code == 404


def signed_out(slug: str) -> HttpResponse:
    return remove_recipe(BrowserClient(), slug)


def without_the_csrf_header(slug: str) -> HttpResponse:
    milo = BrowserClient()
    milo.client.force_login(User.objects.get(email=MILO))
    return milo.client.delete(f'{RECIPES}{slug}/')


def with_no_household_yet(slug: str) -> HttpResponse:
    browser = BrowserClient()
    sign_up(browser, BEN)
    return remove_recipe(browser, slug)


def another_member_while_the_author_is_in(slug: str) -> HttpResponse:
    return remove_recipe(ben_in_milos_household(), slug)


def from_another_household(slug: str) -> HttpResponse:
    return remove_recipe(signed_up(BEN, 'Ben'), slug)


@pytest.mark.django_db
@pytest.mark.parametrize(
    ('attempt', 'status'),
    [
        pytest.param(signed_out, 403, id='signed out'),
        pytest.param(without_the_csrf_header, 403, id='without the CSRF header'),
        pytest.param(with_no_household_yet, 403, id='with no household yet'),
        pytest.param(another_member_while_the_author_is_in, 404, id='another member while the author is in'),
        pytest.param(from_another_household, 404, id='a member of another household'),
    ],
)
def test_only_the_author_can_delete_a_recipe(attempt: Callable[[str], HttpResponse], status: int) -> None:
    _, slug = milos_curry()

    response = attempt(slug)

    assert response.status_code == status
    assert title_of(slug) == CURRY


@pytest.mark.django_db
def test_a_catalogue_recipe_cant_be_deleted() -> None:
    make_recipe(title='Apple tart', slug='apple-tart')
    milo = signed_up(MILO, 'Milo')

    response = remove_recipe(milo, 'apple-tart')

    assert response.status_code == 404
    assert title_of('apple-tart') == 'Apple tart'


@pytest.mark.django_db
@pytest.mark.parametrize(
    'author_goes',
    [
        pytest.param(leaves, id='the author leaves'),
        pytest.param(is_removed, id='the author is removed'),
        pytest.param(joins_jo, id='the author joins another household'),
        pytest.param(deleted_account, id="the author's account is deleted"),
    ],
)
def test_any_member_deletes_a_recipe_once_its_author_has_left(
    author_goes: Callable[[BrowserClient, BrowserClient], None],
) -> None:
    milo, slug = milos_curry()
    ben = ben_in_milos_household()
    author_goes(milo, ben)

    response = remove_recipe(ben, slug)

    assert response.status_code == 204
    assert Recipe.objects.filter(slug=slug).exists() is False


@pytest.mark.django_db
def test_an_author_who_moved_cant_delete_the_original_they_left_behind() -> None:
    milo, slug = milos_curry()
    ben = ben_in_milos_household()
    leaves(milo, ben)

    response = remove_recipe(milo, slug)

    copy = Recipe.objects.get(title=CURRY, household_id=User.objects.get(email=MILO).household_id)
    assert response.status_code == 404
    assert Recipe.objects.get(slug=slug).household_id == User.objects.get(email=BEN).household_id
    assert copy.slug != slug


@pytest.mark.django_db
def test_an_added_ingredient_only_the_deleted_recipe_used_stays_awaiting_review() -> None:
    milo = signed_up(MILO, 'Milo')
    added = add_ingredient(milo, 'quince paste').json()['slug']
    slug = add(milo, {'title': CURRY, 'ingredient_lines': [line(added)]})

    remove_recipe(milo, slug)

    assert Ingredient.objects.get(name='quince paste').status == IngredientStatus.AWAITING_REVIEW


def milo_on_his_own_recipe(milo: BrowserClient, slug: str) -> tuple[BrowserClient, str]:
    return milo, slug


def ben_while_milo_is_in(milo: BrowserClient, slug: str) -> tuple[BrowserClient, str]:
    return ben_in_milos_household(), slug


def ben_after_milo_left(milo: BrowserClient, slug: str) -> tuple[BrowserClient, str]:
    ben = ben_in_milos_household()
    leaves(milo, ben)
    return ben, slug


def a_member_on_a_catalogue_recipe(milo: BrowserClient, slug: str) -> tuple[BrowserClient, str]:
    make_recipe(title='Apple tart', slug='apple-tart')
    return milo, 'apple-tart'


def signed_out_on_a_catalogue_recipe(milo: BrowserClient, slug: str) -> tuple[BrowserClient, str]:
    make_recipe(title='Apple tart', slug='apple-tart')
    return BrowserClient(), 'apple-tart'


@pytest.mark.django_db
@pytest.mark.parametrize(
    ('viewing', 'can_delete'),
    [
        pytest.param(milo_on_his_own_recipe, True, id='the author'),
        pytest.param(ben_while_milo_is_in, False, id='another member while the author is in'),
        pytest.param(ben_after_milo_left, True, id='another member after the author left'),
        pytest.param(a_member_on_a_catalogue_recipe, False, id='a member on a catalogue recipe'),
        pytest.param(signed_out_on_a_catalogue_recipe, False, id='signed out on a catalogue recipe'),
    ],
)
def test_a_recipe_says_whether_the_viewer_may_delete_it(
    viewing: Callable[[BrowserClient, str], tuple[BrowserClient, str]], can_delete: bool
) -> None:
    viewer, slug = viewing(*milos_curry())

    response = viewer.client.get(f'{RECIPES}{slug}/')

    assert (response.status_code, response.json()['can_delete']) == (200, can_delete)


@pytest.mark.django_db
def test_the_write_answers_say_whether_the_account_may_delete() -> None:
    milo = signed_up(MILO, 'Milo')
    added = milo.client.post(RECIPES, {'title': CURRY}, format='json', **milo.csrf_header())
    ben = ben_in_milos_household()

    changed = change(ben, added.json()['slug'], {'title': 'Lamb curry'})

    assert (added.status_code, added.json()['can_delete']) == (201, True)
    assert (changed.status_code, changed.json()['can_delete']) == (200, False)
