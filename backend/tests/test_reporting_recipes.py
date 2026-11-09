from collections.abc import Callable
from typing import Any

import pytest
from django.http import HttpResponse
from pytest_django.fixtures import Settings

from recipes.models import Recipe, Report
from recipes.services import restore_recipe
from tests.test_accounts import BrowserClient
from tests.test_copying_recipes import copy
from tests.test_editing_recipes import CURRY, RECIPES, change, milos_curry, public_curry
from tests.test_household import signed_up
from tests.test_private_recipes import another_household, another_member, its_author, stranger
from tests.test_publishing_recipes import publish, titles
from tests.test_recipes import make_recipe
from tests.test_saving_recipes import favourites, save
from tests.test_seed import seed, seeded, signed_in_as

COPIED = {'reason': 'copied', 'note': "Word for word from Meera Sodha's Made in India, page 112."}


def report(browser: BrowserClient, slug: str, body: dict[str, Any] | None = None) -> HttpResponse:
    return browser.client.post(
        f'{RECIPES}{slug}/report/', COPIED if body is None else body, format='json', **browser.csrf_header()
    )


def reports() -> list[tuple[str, str, str, str]]:
    return [
        (row.recipe.title, row.reporter.name if row.reporter else '', row.reason, row.note)
        for row in Report.objects.select_related('recipe', 'reporter')
    ]


def moderation_of(slug: str) -> str:
    return Recipe.objects.get(slug=slug).moderation


@pytest.mark.django_db
def test_another_household_reports_a_public_recipe_which_hides_it() -> None:
    _, slug = public_curry()

    response = report(signed_up('jo@example.com', 'Jo'), slug)

    assert (response.status_code, response.json()) == (201, {'hidden': True})
    assert reports() == [(CURRY, 'Jo', 'copied', COPIED['note'])]
    assert moderation_of(slug) == 'hidden'


@pytest.mark.django_db
def test_the_note_is_optional() -> None:
    _, slug = public_curry()

    response = report(signed_up('jo@example.com', 'Jo'), slug, {'reason': 'spam'})

    assert response.status_code == 201
    assert reports() == [(CURRY, 'Jo', 'spam', '')]


WITH_THE_CURRY = ['Apple tart', CURRY]


@pytest.mark.django_db
@pytest.mark.parametrize(
    ('viewer', 'listed', 'page'),
    [
        pytest.param(stranger, ['Apple tart'], 404, id='signed out'),
        pytest.param(another_household, ['Apple tart'], 404, id='another household'),
        pytest.param(another_member, ['Apple tart'], 404, id='another member of its household'),
        pytest.param(its_author, WITH_THE_CURRY, 200, id='its author'),
    ],
)
def test_a_reported_recipe_is_its_author_s_alone_until_staff_review_it(
    viewer: Callable[[], BrowserClient], listed: list[str], page: int
) -> None:
    make_recipe(title='Apple tart')
    _, slug = public_curry()
    report(signed_up('cy@example.com', 'Cy'), slug)
    browser = viewer()

    response = browser.client.get(f'{RECIPES}{slug}/')

    assert (titles(browser), titles(browser, '?q=curry')) == (listed, listed[1:])
    assert response.status_code == page


@pytest.mark.django_db
def test_the_author_is_told_their_recipe_is_hidden() -> None:
    milo, slug = public_curry()
    before = milo.client.get(f'{RECIPES}{slug}/').json()['hidden_for_review']
    report(signed_up('jo@example.com', 'Jo'), slug)

    page = milo.client.get(f'{RECIPES}{slug}/').json()
    [card] = milo.client.get(RECIPES).json()

    assert (before, page['hidden_for_review'], card['hidden_for_review']) == (False, True, True)


def signed_out(slug: str) -> HttpResponse:
    return report(BrowserClient(), slug)


def without_the_csrf_header(slug: str) -> HttpResponse:
    jo = signed_up('jo@example.com', 'Jo')
    return jo.client.post(f'{RECIPES}{slug}/report/', COPIED, format='json')


def by_its_author(slug: str) -> HttpResponse:
    return report(its_author(), slug)


def by_another_member(slug: str) -> HttpResponse:
    return report(another_member(), slug)


@pytest.mark.django_db
@pytest.mark.parametrize(
    ('attempt', 'status'),
    [
        pytest.param(signed_out, 403, id='signed out'),
        pytest.param(without_the_csrf_header, 403, id='without the CSRF header'),
        pytest.param(by_its_author, 404, id='its author'),
        pytest.param(by_another_member, 404, id='another member of its household'),
    ],
)
def test_only_another_household_can_report_a_recipe(attempt: Callable[[str], HttpResponse], status: int) -> None:
    _, slug = public_curry()

    response = attempt(slug)

    assert response.status_code == status
    assert (reports(), moderation_of(slug)) == ([], 'unreported')


def private() -> str:
    _, slug = milos_curry()
    return slug


def catalogue() -> str:
    return make_recipe(title='Apple tart').slug


@pytest.mark.django_db
@pytest.mark.parametrize('recipe', [pytest.param(private, id='private'), pytest.param(catalogue, id='catalogue')])
def test_a_private_or_catalogue_recipe_can_t_be_reported(recipe: Callable[[], str]) -> None:
    slug = recipe()

    response = report(signed_up('jo@example.com', 'Jo'), slug)

    assert response.status_code == 404
    assert (reports(), moderation_of(slug)) == ([], 'unreported')


@pytest.mark.django_db
def test_a_recipe_staff_restored_stays_up_when_it_s_reported_again() -> None:
    _, slug = public_curry()
    report(signed_up('cy@example.com', 'Cy'), slug)
    restore_recipe(Recipe.objects.get(slug=slug))

    response = report(signed_up('jo@example.com', 'Jo'), slug)

    assert (response.status_code, response.json()) == (201, {'hidden': False})
    assert [(reporter, reason) for _, reporter, reason, _ in reports()] == [('Cy', 'copied'), ('Jo', 'copied')]
    assert (moderation_of(slug), BrowserClient().client.get(f'{RECIPES}{slug}/').status_code) == ('restored', 200)


@pytest.mark.django_db
def test_an_account_reports_a_recipe_once() -> None:
    _, slug = public_curry()
    restore_recipe(Recipe.objects.get(slug=slug))
    jo = signed_up('jo@example.com', 'Jo')
    report(jo, slug)

    response = report(jo, slug, {'reason': 'spam'})

    assert (response.status_code, response.json()) == (
        400,
        {'non_field_errors': ["You've reported this recipe already."]},
    )
    assert [reason for _, _, reason, _ in reports()] == ['copied']


@pytest.mark.django_db
@pytest.mark.parametrize(
    ('body', 'key', 'message'),
    [
        pytest.param({}, 'reason', "Choose what's wrong with it, like Spam.", id='no reason'),
        pytest.param({'reason': 'boring'}, 'reason', "Choose what's wrong with it, like Spam.", id='unknown reason'),
        pytest.param(
            {'reason': 'other', 'note': 'x' * 501}, 'note', 'Keep the note to 500 characters.', id='long note'
        ),
    ],
)
def test_a_report_the_recipe_can_t_take_is_refused(body: dict[str, Any], key: str, message: str) -> None:
    _, slug = public_curry()

    response = report(signed_up('jo@example.com', 'Jo'), slug, body)

    assert (response.status_code, response.json()) == (400, {key: [message]})
    assert (reports(), moderation_of(slug)) == ([], 'unreported')


@pytest.mark.django_db
@pytest.mark.parametrize(
    ('viewer', 'can_report'),
    [
        pytest.param(stranger, True, id='signed out'),
        pytest.param(another_household, True, id='another household'),
        pytest.param(another_member, False, id='another member of its household'),
        pytest.param(its_author, False, id='its author'),
    ],
)
def test_report_recipe_is_offered_outside_its_household(viewer: Callable[[], BrowserClient], can_report: bool) -> None:
    _, slug = public_curry()

    page = viewer().client.get(f'{RECIPES}{slug}/').json()

    assert (page['can_report'], page['reported']) == (can_report, False)


@pytest.mark.django_db
def test_report_recipe_isn_t_offered_on_a_catalogue_recipe() -> None:
    tart = make_recipe(title='Apple tart')

    page = BrowserClient().client.get(f'{RECIPES}{tart.slug}/').json()

    assert page['can_report'] is False


@pytest.mark.django_db
def test_the_page_says_its_reporter_has_reported_a_restored_recipe() -> None:
    _, slug = public_curry()
    restore_recipe(Recipe.objects.get(slug=slug))
    jo = signed_up('jo@example.com', 'Jo')
    report(jo, slug)

    page = jo.client.get(f'{RECIPES}{slug}/').json()
    others = signed_up('cy@example.com', 'Cy').client.get(f'{RECIPES}{slug}/').json()

    assert (page['can_report'], page['reported'], others['reported']) == (True, True, False)


@pytest.mark.django_db
def test_the_author_can_t_make_a_hidden_recipe_private() -> None:
    milo, slug = public_curry()
    report(signed_up('jo@example.com', 'Jo'), slug)

    response = publish(milo, slug, 'private')

    assert (response.status_code, response.json()) == (
        400,
        {'visibility': ['You can change this once staff have reviewed the report.']},
    )
    assert Recipe.objects.get(slug=slug).visibility == 'public'


@pytest.mark.django_db
def test_the_author_still_edits_and_deletes_a_hidden_recipe() -> None:
    milo, slug = public_curry()
    report(signed_up('jo@example.com', 'Jo'), slug)

    edited = change(milo, slug, {'title': "Nana's curry"})
    deleted = milo.client.delete(f'{RECIPES}{slug}/', **milo.csrf_header())

    assert (edited.status_code, edited.json()['title'], deleted.status_code) == (200, "Nana's curry", 204)
    assert (Recipe.objects.filter(slug=slug).exists(), Report.objects.count()) == (False, 0)


@pytest.mark.django_db
def test_the_author_s_copy_of_a_hidden_recipe_isn_t_hidden() -> None:
    milo, slug = public_curry()
    report(signed_up('jo@example.com', 'Jo'), slug)

    made = copy(milo, slug).json()

    seen_by = another_member().client.get(f'{RECIPES}{made["slug"]}/')
    assert (made['hidden_for_review'], seen_by.status_code) == (False, 200)


@pytest.mark.django_db
def test_a_hidden_recipe_saved_by_someone_else_is_unavailable_in_their_list() -> None:
    _, slug = public_curry()
    jo = signed_up('jo@example.com', 'Jo')
    save(jo, slug)

    report(signed_up('cy@example.com', 'Cy'), slug)

    assert favourites(jo) == [(CURRY, None)]


@pytest.mark.django_db
def test_the_author_s_own_list_says_their_recipe_is_hidden() -> None:
    milo, slug = public_curry()
    save(milo, slug)
    report(signed_up('jo@example.com', 'Jo'), slug)

    [saved] = milo.client.get('/api/lists/favourites/').json()['saved_recipes']

    assert (saved['recipe']['slug'], saved['recipe']['hidden_for_review']) == (slug, True)


@pytest.mark.django_db
def test_a_seeded_member_reports_a_recipe_and_another_reports_a_restored_one(test_accounts: Settings) -> None:
    sams = [{'title': "Sam's curry", 'visibility': 'public'}, {'title': "Sam's dal", 'visibility': 'public'}]
    body = seeded(
        {'members': [{'key': 'sam', 'name': 'Sam', 'recipes': sams, 'restored': ["Sam's dal"]}]},
        {'members': [{'key': 'jo', 'name': 'Jo', 'reports': ["Sam's curry", "Sam's dal"]}]},
    )

    jos = [recipe['title'] for recipe in signed_in_as(body, 'jo').get(RECIPES).json() if recipe['title'][:3] == 'Sam']

    assert jos == ["Sam's dal"]
    assert [(title, reporter) for title, reporter, _, _ in reports()] == [("Sam's curry", 'Jo'), ("Sam's dal", 'Jo')]


@pytest.mark.django_db
def test_a_seeded_member_can_t_report_their_own_household_s_recipe(test_accounts: Settings) -> None:
    sam = {'key': 'sam', 'name': 'Sam', 'recipes': [{'title': "Sam's curry", 'visibility': 'public'}]}
    ben = {'key': 'ben', 'name': 'Ben', 'reports': ["Sam's curry"]}

    response = seed({'households': [{'members': [sam, ben]}]})

    assert (response.status_code, response.json()) == (
        400,
        ["Ben can't report \"Sam's curry\": it's not another household's public recipe."],
    )
