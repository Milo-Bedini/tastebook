from collections.abc import Callable

import pytest
from django.http import HttpResponse

from households.models import User
from recipes.models import Recipe, Step
from tests.test_accounts import BrowserClient, sign_up
from tests.test_editing_recipes import BEN, CURRY, MILO, ben_in_milos_household, change, milos_curry, public_curry
from tests.test_household import leave, signed_up
from tests.test_moving_recipes import CURRY_AS_WRITTEN, the_curry_as_written, write_curry
from tests.test_publishing_recipes import publish
from tests.test_recipes import add_line, make_recipe

RECIPES = '/api/recipes/'
JO = 'jo@example.com'


def copy(browser: BrowserClient, slug: str) -> HttpResponse:
    return browser.client.post(f'{RECIPES}{slug}/copy/', format='json', **browser.csrf_header())


def a_catalogue_recipe_jo_copies() -> tuple[BrowserClient, str, str]:
    make_recipe(title='Apple tart')
    return signed_up(JO, 'Jo'), 'apple-tart', JO


def milos_public_recipe_jo_copies() -> tuple[BrowserClient, str, str]:
    _, slug = public_curry()
    return signed_up(JO, 'Jo'), slug, JO


def milos_private_recipe_ben_copies() -> tuple[BrowserClient, str, str]:
    _, slug = milos_curry()
    return ben_in_milos_household(), slug, BEN


@pytest.mark.django_db
@pytest.mark.parametrize(
    'setup',
    [
        pytest.param(a_catalogue_recipe_jo_copies, id='a catalogue recipe'),
        pytest.param(milos_public_recipe_jo_copies, id="another household's public recipe"),
        pytest.param(milos_private_recipe_ben_copies, id="your household's private recipe"),
    ],
)
def test_a_member_copies_a_recipe_they_can_see_as_their_own_private_recipe(
    setup: Callable[[], tuple[BrowserClient, str, str]],
) -> None:
    copier, slug, email = setup()
    title = Recipe.objects.get(slug=slug).title

    response = copy(copier, slug)

    body = response.json()
    assert response.status_code == 201
    assert (body['title'], body['visibility'], body['author'], body['can_edit'], body['can_publish']) == (
        title,
        'private',
        None,
        True,
        True,
    )
    assert (body['adapted_from']['slug'], body['adapted_from']['title'], body['is_copy']) == (slug, title, True)
    assert body['slug'] != slug
    made = Recipe.objects.get(slug=body['slug'])
    account = User.objects.get(email=email)
    assert (made.household_id, made.created_by_id, made.adapted_from_id) == (
        account.household_id,
        account.pk,
        Recipe.objects.get(slug=slug).pk,
    )


@pytest.mark.django_db
def test_a_copy_holds_the_whole_recipe_and_changing_it_leaves_the_original_alone() -> None:
    milo = signed_up(MILO, 'Milo')
    write_curry(milo)
    original = Recipe.objects.get(title=CURRY).slug

    made = copy(milo, original).json()
    changed = change(milo, made['slug'], {'title': 'My curry', 'ingredient_lines': [], 'steps': []})

    assert the_curry_as_written(made) == CURRY_AS_WRITTEN
    assert (changed.status_code, changed.json()['ingredient_lines'], changed.json()['steps']) == (200, [], [])
    assert the_curry_as_written(milo.client.get(f'{RECIPES}{original}/').json()) == CURRY_AS_WRITTEN
    assert milo.client.get(f'{RECIPES}{original}/').json()['title'] == CURRY


def signed_out(slug: str) -> HttpResponse:
    return copy(BrowserClient(), slug)


def without_the_csrf_header(slug: str) -> HttpResponse:
    jo = signed_up(JO, 'Jo')
    return jo.client.post(f'{RECIPES}{slug}/copy/', format='json')


def with_no_name_yet(slug: str) -> HttpResponse:
    browser = BrowserClient()
    sign_up(browser, JO)
    return copy(browser, slug)


@pytest.mark.django_db
@pytest.mark.parametrize(
    'attempt',
    [
        pytest.param(signed_out, id='signed out'),
        pytest.param(without_the_csrf_header, id='without the CSRF header'),
        pytest.param(with_no_name_yet, id='with no household yet'),
    ],
)
def test_copying_a_recipe_needs_a_member_of_a_household(attempt: Callable[[str], HttpResponse]) -> None:
    make_recipe(title='Apple tart')

    response = attempt('apple-tart')

    assert response.status_code == 403
    assert list(Recipe.objects.values_list('title', flat=True)) == ['Apple tart']


@pytest.mark.django_db
@pytest.mark.parametrize(
    'slug',
    [pytest.param(None, id="another household's private recipe"), pytest.param('no-such-recipe', id='no recipe')],
)
def test_a_recipe_you_cant_see_cant_be_copied(slug: str | None) -> None:
    _, curry = milos_curry()
    jo = signed_up(JO, 'Jo')

    response = copy(jo, slug or curry)

    assert (response.status_code, Recipe.objects.count()) == (404, 1)


def delete_it(milo: BrowserClient, slug: str) -> None:
    milo.client.delete(f'{RECIPES}{slug}/', **milo.csrf_header())


def make_it_private(milo: BrowserClient, slug: str) -> None:
    publish(milo, slug, 'private')


@pytest.mark.django_db
@pytest.mark.parametrize(
    'take_away', [pytest.param(delete_it, id='deleted'), pytest.param(make_it_private, id='made private')]
)
def test_a_copy_outlives_its_original_and_stops_naming_it_once_you_cant_see_it(
    take_away: Callable[[BrowserClient, str], None],
) -> None:
    milo, original = public_curry()
    jo = signed_up(JO, 'Jo')
    made = copy(jo, original).json()['slug']

    take_away(milo, original)

    response = jo.client.get(f'{RECIPES}{made}/')
    body = response.json()
    assert (response.status_code, body['title'], body['adapted_from'], body['is_copy']) == (200, CURRY, None, True)


@pytest.mark.django_db
def test_a_copy_names_its_original_as_it_is_now_and_the_original_names_none() -> None:
    milo, original = milos_curry()
    made = copy(milo, original).json()['slug']

    change(milo, original, {'title': 'Old curry'})

    links = [milo.client.get(f'{RECIPES}{slug}/').json() for slug in [made, original]]
    assert [(link['adapted_from'], link['is_copy']) for link in links] == [
        ({'slug': original, 'title': 'Old curry', 'author': None}, True),
        (None, False),
    ]


@pytest.mark.django_db
def test_a_copy_a_member_takes_along_when_they_move_still_names_its_original() -> None:
    make_recipe(title='Apple tart')
    milo = signed_up(MILO, 'Milo')
    copy(milo, 'apple-tart')
    ben_in_milos_household()

    leave(milo)

    taken = Recipe.objects.get(household=User.objects.get(email=MILO).household, title='Apple tart')
    taken_copy = milo.client.get(f'{RECIPES}{taken.slug}/').json()
    assert (taken_copy['adapted_from'], taken_copy['is_copy'], taken_copy['original_source']) == (
        {'slug': 'apple-tart', 'title': 'Apple tart', 'author': None},
        True,
        'Tastebook',
    )


WIKIBOOKS = 'Adapted from the Wikibooks Cookbook (CC BY-SA 4.0), converted to metric'
WIKIBOOKS_PAGE = 'https://en.wikibooks.org/wiki/Cookbook:Apple_Tart'


def a_published_copy(jo: BrowserClient, original: str) -> str:
    made = copy(jo, original).json()['slug']
    assert publish(jo, made).status_code == 200
    return made


@pytest.mark.django_db
def test_a_published_copy_is_adapted_from_its_original_by_its_author_for_anyone() -> None:
    _, original = public_curry()
    jo = signed_up(JO, 'Jo')
    made = a_published_copy(jo, original)

    body = BrowserClient().client.get(f'{RECIPES}{made}/').json()

    assert (body['visibility'], body['author'], body['adapted_from'], body['is_copy']) == (
        'public',
        'Jo',
        {'slug': original, 'title': CURRY, 'author': 'Milo'},
        True,
    )


@pytest.mark.django_db
@pytest.mark.parametrize(
    'take_away', [pytest.param(delete_it, id='deleted'), pytest.param(make_it_private, id='made private')]
)
def test_a_published_copy_names_nothing_of_an_original_that_s_no_longer_public(
    take_away: Callable[[BrowserClient, str], None],
) -> None:
    milo, original = public_curry()
    jo = signed_up(JO, 'Jo')
    made = a_published_copy(jo, original)

    take_away(milo, original)

    response = BrowserClient().client.get(f'{RECIPES}{made}/')
    body = response.json()
    assert (response.status_code, body['visibility'], body['adapted_from'], body['is_copy']) == (
        200,
        'public',
        None,
        True,
    )
    assert CURRY not in [body['adapted_from'], body['source'], body['original_source']]


@pytest.mark.django_db
def test_a_copy_of_a_catalogue_recipe_keeps_its_credit_where_editing_cant_reach_it() -> None:
    make_recipe(title='Apple tart', source=WIKIBOOKS, source_url=WIKIBOOKS_PAGE)
    jo = signed_up(JO, 'Jo')
    made = copy(jo, 'apple-tart').json()

    changed = change(jo, made['slug'], {'source': 'My nan', 'source_url': '', 'original_source': ''})
    Recipe.objects.filter(slug='apple-tart').delete()

    shown = jo.client.get(f'{RECIPES}{made["slug"]}/').json()
    assert (made['source'], made['source_url'], made['original_source'], made['original_source_url']) == (
        '',
        '',
        WIKIBOOKS,
        WIKIBOOKS_PAGE,
    )
    assert changed.status_code == 200
    assert (shown['source'], shown['original_source'], shown['original_source_url'], shown['adapted_from']) == (
        'My nan',
        WIKIBOOKS,
        WIKIBOOKS_PAGE,
        None,
    )


@pytest.mark.django_db
def test_a_copy_of_a_copy_keeps_the_catalogue_credit_and_a_household_s_credit_stays_editable() -> None:
    tart = make_recipe(title='Apple tart', source=WIKIBOOKS, source_url=WIKIBOOKS_PAGE)
    add_line(tart, 'apple', amount=4)
    Step.objects.create(recipe=tart, text='Bake for 40 minutes.')
    milo, curry = public_curry()
    change(milo, curry, {'source': "Milo's nan"})
    jo = signed_up(JO, 'Jo')
    first = a_published_copy(jo, 'apple-tart')

    again = copy(milo, first).json()
    of_milos = copy(jo, curry).json()

    assert (again['source'], again['original_source'], again['adapted_from']['author']) == ('', WIKIBOOKS, 'Jo')
    assert (of_milos['source'], of_milos['original_source']) == ("Milo's nan", '')
