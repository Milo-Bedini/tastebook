from collections.abc import Callable
from typing import Any

import pytest
from django.http import HttpResponse
from pytest_django import DjangoAssertNumQueries

from households.models import User
from recipes.models import Ingredient, IngredientLine, IngredientStatus, Recipe, Step
from tests.test_accounts import BrowserClient, sign_up
from tests.test_editing_recipes import BEN, CURRY, MILO, RECIPES, ben_in_milos_household, complete_curry, public_curry
from tests.test_household import signed_up
from tests.test_private_recipes import add, another_household, another_member, its_author, stranger
from tests.test_recipes import add_line, ingredient, make_recipe


def publish(browser: BrowserClient, slug: str, visibility: Any = 'public') -> HttpResponse:
    return browser.client.put(
        f'{RECIPES}{slug}/visibility/', {'visibility': visibility}, format='json', **browser.csrf_header()
    )


def visibility_of(slug: str) -> str:
    return Recipe.objects.get(slug=slug).visibility


def titles(browser: BrowserClient, query: str = '') -> list[str]:
    return [recipe['title'] for recipe in browser.client.get(f'{RECIPES}{query}').json()['results']]


@pytest.mark.django_db
def test_the_author_makes_a_complete_recipe_public() -> None:
    milo, slug = complete_curry()

    response = publish(milo, slug)

    body = response.json()
    assert (response.status_code, body['visibility'], body['author']) == (200, 'public', 'Milo')
    assert visibility_of(slug) == 'public'


def no_lines(curry: Recipe) -> None:
    IngredientLine.objects.filter(recipe=curry).delete()


def no_steps(curry: Recipe) -> None:
    Step.objects.filter(recipe=curry).delete()


def no_prep(curry: Recipe) -> None:
    Recipe.objects.filter(pk=curry.pk).update(prep_minutes=None)


def no_cook(curry: Recipe) -> None:
    Recipe.objects.filter(pk=curry.pk).update(cook_minutes=None)


def no_servings(curry: Recipe) -> None:
    Recipe.objects.filter(pk=curry.pk).update(servings=None)


def nothing_at_all(curry: Recipe) -> None:
    for remove in [no_lines, no_steps, no_prep, no_cook, no_servings]:
        remove(curry)


@pytest.mark.django_db
@pytest.mark.parametrize(
    ('remove', 'message'),
    [
        pytest.param(no_lines, 'Add ingredients before making it public.', id='no ingredients'),
        pytest.param(no_steps, 'Add a method before making it public.', id='no method'),
        pytest.param(no_prep, 'Add a prep time before making it public.', id='no prep time'),
        pytest.param(no_cook, 'Add a cook time before making it public.', id='no cook time'),
        pytest.param(no_servings, 'Add servings or a yield before making it public.', id='no servings'),
        pytest.param(
            nothing_at_all,
            'Add ingredients, a method, a prep time, a cook time and servings or a yield before making it public.',
            id='nothing',
        ),
    ],
)
def test_a_recipe_missing_what_a_public_recipe_needs_stays_private(
    remove: Callable[[Recipe], None], message: str
) -> None:
    milo, slug = complete_curry()
    remove(Recipe.objects.get(slug=slug))

    response = publish(milo, slug)

    assert (response.status_code, response.json()) == (400, {'visibility': [message]})
    assert visibility_of(slug) == 'private'


@pytest.mark.django_db
def test_two_gaps_are_named_with_an_and() -> None:
    milo, slug = complete_curry()
    curry = Recipe.objects.get(slug=slug)
    no_steps(curry)
    no_cook(curry)

    response = publish(milo, slug)

    assert response.json() == {'visibility': ['Add a method and a cook time before making it public.']}


@pytest.mark.django_db
def test_an_ingredient_awaiting_review_doesnt_keep_a_recipe_private() -> None:
    milo, slug = complete_curry()
    curry = Recipe.objects.get(slug=slug)
    no_lines(curry)
    Ingredient.objects.filter(pk=ingredient('quince paste').pk).update(status=IngredientStatus.AWAITING_REVIEW)
    add_line(curry, 'quince paste')

    response = publish(milo, slug)

    assert (response.status_code, response.json()['visibility']) == (200, 'public')


@pytest.mark.django_db
def test_a_yield_counts_instead_of_servings() -> None:
    milo, slug = complete_curry()
    Recipe.objects.filter(slug=slug).update(servings=None, yield_amount=6, yield_unit='portions')

    response = publish(milo, slug)

    assert (response.status_code, visibility_of(slug)) == (200, 'public')


def signed_out(slug: str) -> HttpResponse:
    return publish(BrowserClient(), slug)


def without_the_csrf_header(slug: str) -> HttpResponse:
    milo = BrowserClient()
    milo.client.force_login(User.objects.get(email=MILO))
    return milo.client.put(f'{RECIPES}{slug}/visibility/', {'visibility': 'public'}, format='json')


def with_no_name_yet(slug: str) -> HttpResponse:
    browser = BrowserClient()
    sign_up(browser, BEN)
    return publish(browser, slug)


def another_member_of_the_household(slug: str) -> HttpResponse:
    return publish(ben_in_milos_household(), slug)


def from_another_household(slug: str) -> HttpResponse:
    return publish(signed_up(BEN, 'Ben'), slug)


def on_no_such_recipe(slug: str) -> HttpResponse:
    return publish(its_author(), 'no-such-recipe')


@pytest.mark.django_db
@pytest.mark.parametrize(
    ('attempt', 'status'),
    [
        pytest.param(signed_out, 403, id='signed out'),
        pytest.param(without_the_csrf_header, 403, id='without the CSRF header'),
        pytest.param(with_no_name_yet, 403, id='with no household yet'),
        pytest.param(another_member_of_the_household, 404, id='another member of the household'),
        pytest.param(from_another_household, 404, id='a member of another household'),
        pytest.param(on_no_such_recipe, 404, id='no such recipe'),
    ],
)
def test_only_the_author_can_make_a_recipe_public(attempt: Callable[[str], HttpResponse], status: int) -> None:
    _, slug = complete_curry()

    response = attempt(slug)

    assert response.status_code == status
    assert visibility_of(slug) == 'private'


@pytest.mark.django_db
@pytest.mark.parametrize('visibility', ['public', 'private'])
def test_nobody_changes_a_catalogue_recipes_visibility(visibility: str) -> None:
    make_recipe(title='Apple tart', slug='apple-tart')
    milo = signed_up(MILO, 'Milo')

    response = publish(milo, 'apple-tart', visibility)

    assert response.status_code == 404
    assert visibility_of('apple-tart') == 'public'


NOT_A_VISIBILITY = {'visibility': ['Say whether the recipe is public or private.']}


@pytest.mark.django_db
@pytest.mark.parametrize('body', [{}, {'visibility': 'friends'}])
def test_a_visibility_that_isnt_public_or_private_is_refused(body: dict[str, Any]) -> None:
    milo, slug = complete_curry()

    response = milo.client.put(f'{RECIPES}{slug}/visibility/', body, format='json', **milo.csrf_header())

    assert (response.status_code, response.json()) == (400, NOT_A_VISIBILITY)
    assert visibility_of(slug) == 'private'


@pytest.mark.django_db
@pytest.mark.parametrize(
    ('make', 'visibility'),
    [
        pytest.param(public_curry, 'public', id='public to public'),
        pytest.param(complete_curry, 'private', id='private to private'),
    ],
)
def test_asking_for_the_visibility_a_recipe_has_changes_nothing(
    make: Callable[[], tuple[BrowserClient, str]], visibility: str
) -> None:
    milo, slug = make()

    response = publish(milo, slug, visibility)

    assert (response.status_code, response.json()['visibility'], visibility_of(slug)) == (200, visibility, visibility)


@pytest.mark.django_db
def test_the_author_makes_a_public_recipe_private_again() -> None:
    milo, slug = public_curry()

    response = publish(milo, slug, 'private')

    body = response.json()
    assert (response.status_code, body['visibility'], body['author']) == (200, 'private', None)
    for outsider in [stranger(), another_household()]:
        assert outsider.client.get(f'{RECIPES}{slug}/').status_code == 404
        assert CURRY not in titles(outsider)


@pytest.mark.django_db
def test_a_public_recipe_missing_something_still_goes_private() -> None:
    milo, slug = public_curry()
    no_steps(Recipe.objects.get(slug=slug))

    response = publish(milo, slug, 'private')

    assert (response.status_code, visibility_of(slug)) == (200, 'private')


@pytest.mark.django_db
@pytest.mark.parametrize(
    'viewer',
    [
        pytest.param(stranger, id='signed out'),
        pytest.param(another_household, id='another household'),
        pytest.param(another_member, id='another member of its household'),
        pytest.param(its_author, id='its author'),
    ],
)
def test_everyone_finds_and_opens_a_public_recipe(viewer: Callable[[], BrowserClient]) -> None:
    _, slug = public_curry()
    browser = viewer()

    response = browser.client.get(f'{RECIPES}{slug}/')

    assert titles(browser, '?q=curry') == [CURRY]
    assert (response.status_code, response.json()['title'], response.json()['author']) == (200, CURRY, 'Milo')


@pytest.mark.django_db
def test_only_a_public_household_recipe_names_its_author() -> None:
    make_recipe(title='Apple tart', slug='apple-tart')
    milo, curry = public_curry()
    flatbreads = add(milo, {'title': 'Flatbreads'}).json()['slug']

    listed = {recipe['title']: recipe['author'] for recipe in milo.client.get(RECIPES).json()['results']}
    opened = [milo.client.get(f'{RECIPES}{slug}/').json()['author'] for slug in ['apple-tart', curry, flatbreads]]

    assert listed == {'Apple tart': None, CURRY: 'Milo', 'Flatbreads': None}
    assert opened == [None, 'Milo', None]


def the_author(slug: str) -> BrowserClient:
    return its_author()


def another_member_viewing(slug: str) -> BrowserClient:
    return ben_in_milos_household()


def another_household_viewing(slug: str) -> BrowserClient:
    return signed_up('jo@example.com', 'Jo')


def signed_out_viewing(slug: str) -> BrowserClient:
    return BrowserClient()


@pytest.mark.django_db
@pytest.mark.parametrize(
    ('make', 'viewing', 'flags'),
    [
        pytest.param(complete_curry, the_author, (True, True), id='private, its author'),
        pytest.param(complete_curry, another_member_viewing, (True, False), id='private, another member'),
        pytest.param(public_curry, the_author, (True, True), id='public, its author'),
        pytest.param(public_curry, another_member_viewing, (False, False), id='public, another member'),
        pytest.param(public_curry, another_household_viewing, (False, False), id='public, another household'),
        pytest.param(public_curry, signed_out_viewing, (False, False), id='public, signed out'),
    ],
)
def test_a_recipe_says_whether_the_viewer_may_edit_and_publish_it(
    make: Callable[[], tuple[BrowserClient, str]],
    viewing: Callable[[str], BrowserClient],
    flags: tuple[bool, bool],
) -> None:
    _, slug = make()

    body = viewing(slug).client.get(f'{RECIPES}{slug}/').json()

    assert (body['can_edit'], body['can_publish']) == flags


@pytest.mark.django_db
def test_nobody_may_edit_or_publish_a_catalogue_recipe() -> None:
    make_recipe(title='Apple tart', slug='apple-tart')
    milo = signed_up(MILO, 'Milo')

    body = milo.client.get(f'{RECIPES}apple-tart/').json()

    assert (body['title'], body['can_edit'], body['can_publish']) == ('Apple tart', False, False)


@pytest.mark.django_db
def test_lists_public_recipes_by_two_authors_in_four_queries(
    django_assert_num_queries: DjangoAssertNumQueries,
) -> None:
    public_curry()
    jo = signed_up('jo@example.com', 'Jo')
    dal = add(jo, {'title': "Jo's dal"}).json()['slug']
    Recipe.objects.filter(slug=dal).update(visibility='public')
    browser = BrowserClient()

    with django_assert_num_queries(4):
        response = browser.client.get(RECIPES)

    assert [(recipe['title'], recipe['author']) for recipe in response.json()['results']] == [
        (CURRY, 'Milo'),
        ("Jo's dal", 'Jo'),
    ]
