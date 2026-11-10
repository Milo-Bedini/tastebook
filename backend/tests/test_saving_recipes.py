import time
from collections.abc import Callable
from typing import Any

import pytest
from django.db import connection
from django.http import HttpResponse
from django.test.utils import CaptureQueriesContext

from households.models import User
from recipe_collections.models import RecipeList, SavedRecipe
from recipes.models import Recipe
from tests.test_accounts import BrowserClient
from tests.test_deleting_recipes import remove_recipe
from tests.test_editing_recipes import CURRY, RECIPES, ben_in_milos_household, change, milos_curry, public_curry
from tests.test_household import signed_up
from tests.test_recipes import make_recipe

LISTS = '/api/lists/'
FAVOURITES = '/api/lists/favourites/'
SAVED = '/api/lists/favourites/saved/'
RESTORE = '/api/lists/saved/restore/'
UNSAVE = '/api/lists/saved/'
JO = 'jo@example.com'
SAM = 'sam@example.com'


def save(browser: BrowserClient, slug: str) -> HttpResponse:
    return browser.client.post(SAVED, {'recipe': slug}, format='json', **browser.csrf_header())


def unsave(browser: BrowserClient, saved_id: int) -> HttpResponse:
    return browser.client.delete(f'{UNSAVE}{saved_id}/', **browser.csrf_header())


def undo(browser: BrowserClient, token: str) -> HttpResponse:
    return browser.client.post(RESTORE, {'undo': token}, format='json', **browser.csrf_header())


def favourites(browser: BrowserClient) -> list[tuple[str, str | None]]:
    """Each saved recipe's title as saved, and its recipe's slug, or None when it's unavailable."""
    saved = browser.client.get(FAVOURITES).json()['saved_recipes']
    return [(entry['title'], entry['recipe'] and entry['recipe']['slug']) for entry in saved]


def jo() -> BrowserClient:
    return signed_up(JO, 'Jo')


@pytest.mark.django_db
def test_saving_a_public_recipe_keeps_a_link_to_it() -> None:
    baklava = make_recipe(title='Baklava')
    browser = jo()

    response = save(browser, baklava.slug)

    assert response.status_code == 201
    body = response.json()
    assert (body['title'], body['recipe']['slug'], body['recipe']['title']) == ('Baklava', baklava.slug, 'Baklava')
    # A link, not a copy: there's still one Baklava, and the save points at it.
    assert Recipe.objects.filter(title='Baklava').count() == 1
    assert SavedRecipe.objects.get(pk=body['id']).recipe_id == baklava.pk


@pytest.mark.django_db
def test_saving_a_recipe_again_answers_the_save_it_has() -> None:
    baklava = make_recipe(title='Baklava')
    browser = jo()
    first = save(browser, baklava.slug).json()

    again = save(browser, baklava.slug)

    assert (again.status_code, again.json()['id']) == (200, first['id'])
    assert SavedRecipe.objects.count() == 1


@pytest.mark.django_db
def test_favourites_show_the_author_s_changes() -> None:
    milo, slug = public_curry()
    browser = jo()
    save(browser, slug)

    change(milo, slug, {'description': 'Now with more garlic.'})

    saved = browser.client.get(FAVOURITES).json()['saved_recipes']
    assert saved[0]['recipe']['description'] == 'Now with more garlic.'


@pytest.mark.django_db
def test_favourites_list_recipes_newest_saved_first() -> None:
    browser = jo()
    for title in ['Shakshuka', 'Baklava', 'Bibimbap']:
        save(browser, make_recipe(title=title).slug)

    response = browser.client.get(FAVOURITES)

    assert response.status_code == 200
    assert (response.json()['slug'], response.json()['name'], response.json()['scope']) == (
        'favourites',
        'Favourites',
        'personal',
    )
    assert [title for title, _ in favourites(browser)] == ['Bibimbap', 'Baklava', 'Shakshuka']


@pytest.mark.django_db
def test_a_saved_recipe_is_shown_as_the_recipe_list_shows_it() -> None:
    _, slug = public_curry()
    browser = jo()
    save(browser, slug)

    listed = browser.client.get(RECIPES, {'q': 'curry'}).json()['results']
    saved = browser.client.get(FAVOURITES).json()['saved_recipes']

    assert saved[0]['recipe'] == listed[0]
    assert saved[0]['recipe']['author'] == 'Milo'


@pytest.mark.django_db
def test_every_account_has_favourites_before_it_saves_anything() -> None:
    browser = jo()

    lists = browser.client.get(LISTS)
    empty = browser.client.get(FAVOURITES)

    assert lists.status_code == 200
    assert lists.json() == {
        'household_name': "Jo's household",
        'household_members': 1,
        'lists': [{'slug': 'favourites', 'name': 'Favourites', 'scope': 'personal', 'recipe_count': 0, 'covers': []}],
    }
    assert (empty.status_code, empty.json()['saved_recipes']) == (200, [])


@pytest.mark.django_db
def test_the_lists_page_counts_every_saved_recipe_and_shows_the_newest_three_available() -> None:
    browser = jo()
    recipes = [make_recipe(title=title) for title in ['Shakshuka', 'Baklava', 'Bibimbap', 'Ribollita', 'Kedgeree']]
    for recipe in recipes:
        save(browser, recipe.slug)
    # The newest is no longer available, so it's counted but has no cover.
    recipes[-1].delete()

    [favourites_list] = browser.client.get(LISTS).json()['lists']

    assert favourites_list['recipe_count'] == 5
    assert [cover['id'] for cover in favourites_list['covers']] == [recipe.pk for recipe in recipes[3:0:-1]]


@pytest.mark.parametrize(
    ('whose', 'expected'),
    [
        pytest.param('another household', 404, id="another household's private recipe"),
        pytest.param('own household', 201, id="the household's own private recipe"),
    ],
)
@pytest.mark.django_db
def test_saving_a_private_recipe(whose: str, expected: int) -> None:
    _, slug = milos_curry()
    browser = jo() if whose == 'another household' else ben_in_milos_household()

    response = save(browser, slug)

    assert response.status_code == expected
    assert SavedRecipe.objects.count() == (1 if expected == 201 else 0)


@pytest.mark.django_db
def test_saving_a_recipe_that_doesn_t_exist_is_not_found() -> None:
    browser = jo()

    assert save(browser, 'no-such-recipe').status_code == 404
    assert browser.client.post(SAVED, {}, format='json', **browser.csrf_header()).status_code == 400


def made_private(milo: BrowserClient, slug: str) -> None:
    milo.client.put(f'{RECIPES}{slug}/visibility/', {'visibility': 'private'}, format='json', **milo.csrf_header())


def deleted(milo: BrowserClient, slug: str) -> None:
    remove_recipe(milo, slug)


@pytest.mark.parametrize('gone', [pytest.param(made_private, id='made private'), pytest.param(deleted, id='deleted')])
@pytest.mark.django_db
def test_a_saved_recipe_its_author_takes_away_keeps_its_place_by_the_title_it_was_saved_with(
    gone: Callable[[BrowserClient, str], None],
) -> None:
    milo, slug = public_curry()
    browser = jo()
    save(browser, make_recipe(title='Baklava').slug)
    save(browser, slug)
    save(browser, make_recipe(title='Bibimbap').slug)
    change(milo, slug, {'title': 'Secret curry'})

    gone(milo, slug)

    assert favourites(browser) == [('Bibimbap', 'bibimbap'), (CURRY, None), ('Baklava', 'baklava')]
    unavailable = browser.client.get(FAVOURITES).content.decode()
    assert 'Secret curry' not in unavailable


@pytest.mark.django_db
def test_a_recipe_made_public_again_is_available_again() -> None:
    milo, slug = public_curry()
    browser = jo()
    save(browser, slug)
    made_private(milo, slug)

    milo.client.put(f'{RECIPES}{slug}/visibility/', {'visibility': 'public'}, format='json', **milo.csrf_header())

    assert favourites(browser) == [(CURRY, slug)]


@pytest.mark.django_db
def test_unsaving_takes_a_recipe_out_of_favourites() -> None:
    browser = jo()
    saved = save(browser, make_recipe(title='Baklava').slug).json()

    response = unsave(browser, saved['id'])

    assert response.status_code == 200
    assert isinstance(response.json()['undo'], str)
    assert favourites(browser) == []
    assert unsave(browser, saved['id']).status_code == 404


@pytest.mark.django_db
def test_an_unavailable_recipe_can_be_unsaved() -> None:
    milo, slug = public_curry()
    browser = jo()
    saved = save(browser, slug).json()
    deleted(milo, slug)

    assert unsave(browser, saved['id']).status_code == 200
    assert favourites(browser) == []


@pytest.mark.django_db
def test_nobody_unsaves_another_account_s_saved_recipe() -> None:
    browser = jo()
    saved = save(browser, make_recipe(title='Baklava').slug).json()
    sam = signed_up(SAM, 'Sam')

    assert unsave(sam, saved['id']).status_code == 404
    assert favourites(browser) == [('Baklava', 'baklava')]


@pytest.mark.parametrize(
    'gone_meanwhile', [pytest.param(False, id='available'), pytest.param(True, id='deleted meanwhile')]
)
@pytest.mark.django_db
def test_undo_puts_a_saved_recipe_back_in_its_place(gone_meanwhile: bool) -> None:
    milo, slug = public_curry()
    browser = jo()
    save(browser, make_recipe(title='Baklava').slug)
    saved = save(browser, slug).json()
    save(browser, make_recipe(title='Bibimbap').slug)
    token = unsave(browser, saved['id']).json()['undo']
    if gone_meanwhile:
        deleted(milo, slug)

    response = undo(browser, token)

    assert response.status_code == 201
    assert (response.json()['id'], response.json()['saved_at']) == (saved['id'], saved['saved_at'])
    assert favourites(browser) == [
        ('Bibimbap', 'bibimbap'),
        (CURRY, None if gone_meanwhile else slug),
        ('Baklava', 'baklava'),
    ]
    # Undoing twice puts it back once.
    assert undo(browser, token).json()['id'] == saved['id']
    assert SavedRecipe.objects.filter(title=CURRY).count() == 1


def forged(token: str) -> str:
    return token[:-1] + ('a' if token[-1] != 'a' else 'b')


@pytest.mark.parametrize(
    ('who', 'tamper'),
    [
        pytest.param('jo', forged, id='forged'),
        pytest.param('sam', lambda token: token, id="another account's"),
    ],
)
@pytest.mark.django_db
def test_undo_refuses_a_token_that_isn_t_the_account_s(who: str, tamper: Callable[[str], str]) -> None:
    browser = jo()
    saved = save(browser, make_recipe(title='Baklava').slug).json()
    token = unsave(browser, saved['id']).json()['undo']
    caller = browser if who == 'jo' else signed_up(SAM, 'Sam')

    response = undo(caller, tamper(token))

    assert (response.status_code, response.json()) == (400, {'undo': ["That can't be undone any more."]})
    assert SavedRecipe.objects.count() == 0


@pytest.mark.django_db
def test_undo_refuses_a_token_over_an_hour_old(monkeypatch: pytest.MonkeyPatch) -> None:
    browser = jo()
    saved = save(browser, make_recipe(title='Baklava').slug).json()
    token = unsave(browser, saved['id']).json()['undo']
    an_hour_on = time.time() + 3601
    monkeypatch.setattr(time, 'time', lambda: an_hour_on)

    response = undo(browser, token)

    assert response.status_code == 400
    assert favourites(browser) == []


def signed_out_probes() -> list[Any]:
    return [
        pytest.param('get', LISTS, None, id='GET lists'),
        pytest.param('get', FAVOURITES, None, id='GET favourites'),
        pytest.param('post', SAVED, {'recipe': 'baklava'}, id='POST saved'),
        pytest.param('delete', f'{UNSAVE}1/', None, id='DELETE saved'),
        pytest.param('post', RESTORE, {'undo': 'a-token'}, id='POST restore'),
    ]


@pytest.mark.parametrize(('method', 'path', 'body'), signed_out_probes())
@pytest.mark.django_db
def test_signed_out_there_are_no_lists(method: str, path: str, body: dict[str, str] | None) -> None:
    make_recipe(title='Baklava')
    browser = BrowserClient()

    response = getattr(browser.client, method)(path, body, format='json', **browser.csrf_header())

    assert response.status_code == 403
    assert RecipeList.objects.count() == 0


@pytest.mark.django_db
def test_favourites_take_the_same_queries_however_many_are_saved() -> None:
    browser = jo()

    def queries() -> int:
        with CaptureQueriesContext(connection) as captured:
            browser.client.get(FAVOURITES)
        return len(captured)

    save(browser, make_recipe(title='Baklava').slug)
    one = queries()
    for title in ['Shakshuka', 'Bibimbap', 'Ribollita']:
        save(browser, make_recipe(title=title).slug)

    assert queries() == one


@pytest.mark.django_db
def test_the_author_sees_how_many_other_people_saved_their_recipe() -> None:
    milo, slug = public_curry()
    ben = ben_in_milos_household()
    for browser in [milo, jo(), signed_up(SAM, 'Sam')]:
        save(browser, slug)

    seen_by_milo = milo.client.get(f'{RECIPES}{slug}/').json()
    seen_by_ben = ben.client.get(f'{RECIPES}{slug}/').json()

    # Milo's own save isn't counted; Ben may not delete it, so he isn't told.
    assert seen_by_milo['save_count'] == 2
    assert seen_by_ben['save_count'] is None


@pytest.mark.django_db
def test_an_account_s_lists_go_with_it() -> None:
    browser = jo()
    save(browser, make_recipe(title='Baklava').slug)

    User.objects.get(email=JO).delete()

    assert (RecipeList.objects.count(), SavedRecipe.objects.count()) == (0, 0)
