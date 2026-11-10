import logging
from collections.abc import Callable
from typing import Any

import pytest
from django.contrib.messages import get_messages
from django.core.mail import EmailMessage
from django.http import HttpResponse
from django.test import Client
from django.urls import reverse
from django.utils.html import escape
from pytest_django.fixtures import Settings

from households.models import User
from recipes.models import Recipe, Report
from tests.test_accounts import BrowserClient
from tests.test_copying_recipes import copy
from tests.test_editing_recipes import CURRY, MILO, RECIPES, add, public_curry
from tests.test_household import signed_up
from tests.test_private_recipes import another_household, another_member, its_author, stranger
from tests.test_publishing_recipes import publish
from tests.test_recipes import make_recipe
from tests.test_reporting_recipes import report
from tests.test_saving_recipes import favourites, save
from tests.test_seed import seeded, signed_in_as

REPORTED = reverse('admin:recipes_reportedrecipe_changelist')
SPAM = {'reason': 'spam', 'note': 'Jo here: it links to a casino.'}


def reported_curry(**report_body: str) -> str:
    """Milo's public curry, reported by Jo, which hides it."""
    _, slug = public_curry()
    report(signed_up('jo@example.com', 'Jo'), slug, report_body or None)
    return slug


def review(admin_client: Client, action: str, *slugs: str) -> HttpResponse:
    """Staff tick the recipes in the reported recipes list and run the action on them."""
    chosen = [Recipe.objects.get(slug=slug).pk for slug in slugs]
    return admin_client.post(REPORTED, {'action': action, '_selected_action': chosen}, follow=True)


def said(response: HttpResponse) -> list[str]:
    return [str(message) for message in get_messages(response.wsgi_request)]


def state_of(slug: str) -> tuple[str, str, list[bool]]:
    recipe = Recipe.objects.get(slug=slug)
    reviewed = [report.reviewed_at is not None for report in Report.objects.filter(recipe=recipe)]
    return recipe.visibility, recipe.moderation, reviewed


@pytest.mark.django_db
def test_staff_see_each_reported_household_recipe_with_its_reports_awaiting_review(admin_client: Client) -> None:
    make_recipe(title='Catalogue tart')
    milo, slug = public_curry()
    Recipe.objects.filter(slug=add(milo, {'title': 'Unreported dal'})).update(visibility='public')
    report(signed_up('jo@example.com', 'Jo'), slug)

    page = admin_client.get(REPORTED).content.decode()

    assert (escape(CURRY) in page, 'Unreported dal' in page, 'Catalogue tart' in page) == (True, False, False)
    assert '<td class="field-awaiting">1</td>' in page
    assert 'Hidden while a report is reviewed' in page


@pytest.mark.django_db
def test_staff_read_the_recipe_and_each_report_on_its_page(admin_client: Client) -> None:
    slug = reported_curry(reason='copied', note='Word for word from Made in India.')
    recipe = Recipe.objects.get(slug=slug)

    page = admin_client.get(reverse('admin:recipes_reportedrecipe_change', args=[recipe.pk])).content.decode()

    assert 'Copied without credit' in page
    assert 'Word for word from Made in India.' in page
    assert 'Add the tomatoes.' in page
    assert 'name="_save"' not in page


@pytest.mark.django_db
@pytest.mark.parametrize(
    ('viewer', 'page'),
    [
        pytest.param(stranger, 200, id='signed out'),
        pytest.param(another_household, 200, id='another household'),
        pytest.param(another_member, 200, id='another member of its household'),
    ],
)
def test_a_restored_recipe_is_public_again(
    admin_client: Client, viewer: Callable[[], BrowserClient], page: int
) -> None:
    slug = reported_curry()
    before = viewer().client.get(f'{RECIPES}{slug}/').status_code

    response = review(admin_client, 'restore', slug)

    assert (before, viewer().client.get(f'{RECIPES}{slug}/').status_code) == (404, page)
    assert state_of(slug) == ('public', 'restored', [True])
    assert said(response) == [f'Restored {CURRY}.']


@pytest.mark.django_db
@pytest.mark.parametrize(
    ('viewer', 'page'),
    [
        pytest.param(stranger, 404, id='signed out'),
        pytest.param(another_household, 404, id='another household'),
        pytest.param(another_member, 200, id='another member of its household'),
        pytest.param(its_author, 200, id='its author'),
    ],
)
def test_a_removed_recipe_is_its_household_s_alone(
    admin_client: Client, viewer: Callable[[], BrowserClient], page: int
) -> None:
    slug = reported_curry()

    response = review(admin_client, 'remove', slug)

    assert viewer().client.get(f'{RECIPES}{slug}/').status_code == page
    assert state_of(slug) == ('private', 'removed', [True])
    assert said(response) == [f'Removed {CURRY}.']


@pytest.mark.django_db
def test_the_author_can_t_make_a_removed_recipe_public_again(admin_client: Client) -> None:
    slug = reported_curry()
    review(admin_client, 'remove', slug)

    response = publish(its_author(), slug)

    assert (response.status_code, response.json()) == (
        400,
        {'visibility': ['Staff removed this recipe from public view after a report, so it stays private.']},
    )
    assert state_of(slug) == ('private', 'removed', [True])


@pytest.mark.django_db
def test_a_removed_recipe_is_unavailable_to_those_who_saved_it_and_copies_say_so(admin_client: Client) -> None:
    _, slug = public_curry()
    cy = signed_up('cy@example.com', 'Cy')
    save(cy, slug)
    made = copy(cy, slug).json()['slug']
    report(signed_up('jo@example.com', 'Jo'), slug)
    review(admin_client, 'restore', slug)
    before = (favourites(cy), cy.client.get(f'{RECIPES}{made}/').json()['adapted_from']['slug'])
    report(signed_up('di@example.com', 'Di'), slug)

    review(admin_client, 'remove', slug)

    after = (favourites(cy), cy.client.get(f'{RECIPES}{made}/').json()['adapted_from'])
    assert (before, after) == (([(CURRY, slug)], slug), ([(CURRY, None)], None))


@pytest.mark.django_db
@pytest.mark.parametrize(
    ('action', 'subject', 'outcome'),
    [
        (
            'restore',
            f'Staff restored {CURRY}',
            "Staff have reviewed it and found nothing wrong, so they've restored it: everyone can find it on "
            'Tastebook again.',
        ),
        (
            'remove',
            f'Staff removed {CURRY} from public view',
            "It's private now: your household can still find, cook and change it, but it can't be made public again.",
        ),
    ],
)
def test_the_author_is_emailed_the_outcome_and_the_reasons(
    admin_client: Client,
    mailoutbox: list[EmailMessage],
    django_capture_on_commit_callbacks: Callable[..., Any],
    action: str,
    subject: str,
    outcome: str,
) -> None:
    slug = reported_curry(**SPAM)
    review(admin_client, 'restore', slug)
    report(signed_up('cy@example.com', 'Cy'), slug, {'reason': 'copied'})
    report(signed_up('di@example.com', 'Di'), slug, {'reason': 'offensive'})
    mailoutbox.clear()

    with django_capture_on_commit_callbacks(execute=True):
        review(admin_client, action, slug)

    [email] = mailoutbox
    assert (email.to, email.subject) == ([MILO], subject)
    assert f'Your recipe "{CURRY}" was reported as offensive and copied without credit.' in email.body
    assert outcome in email.body
    assert ('Jo' in email.body, SPAM['note'] in email.body, 'spam' in email.body) == (False, False, False)


@pytest.mark.django_db
def test_a_recipe_whose_reports_are_all_reviewed_is_left_as_it_is(
    admin_client: Client, mailoutbox: list[EmailMessage], django_capture_on_commit_callbacks: Callable[..., Any]
) -> None:
    slug = reported_curry()
    review(admin_client, 'remove', slug)
    mailoutbox.clear()

    with django_capture_on_commit_callbacks(execute=True):
        response = review(admin_client, 'restore', slug)

    assert said(response) == ['1 had no reports awaiting review, so nothing changed.']
    assert (state_of(slug), mailoutbox) == (('private', 'removed', [True]), [])


@pytest.mark.django_db
def test_a_report_of_a_restored_recipe_awaits_review_and_staff_can_remove_it(admin_client: Client) -> None:
    slug = reported_curry()
    review(admin_client, 'restore', slug)
    report(signed_up('cy@example.com', 'Cy'), slug)

    awaiting = admin_client.get(REPORTED).content.decode()
    review(admin_client, 'remove', slug)
    reviewed = admin_client.get(REPORTED).content.decode()

    assert ('<td class="field-awaiting">1</td>' in awaiting, '<td class="field-awaiting">0</td>' in reviewed) == (
        True,
        True,
    )
    assert state_of(slug) == ('private', 'removed', [True, True])


@pytest.mark.django_db
def test_recipes_awaiting_review_come_first(admin_client: Client) -> None:
    milo, slug = public_curry()
    dal = add(milo, {'title': 'Lentil dal'})
    Recipe.objects.filter(slug=dal).update(visibility='public')
    report(signed_up('cy@example.com', 'Cy'), slug)
    # Reported later, but reviewed already.
    report(signed_up('jo@example.com', 'Jo'), dal)
    review(admin_client, 'remove', dal)

    page = admin_client.get(REPORTED).content.decode()

    assert page.index(escape(CURRY)) < page.index('Lentil dal')


@pytest.mark.django_db
def test_a_recipe_whose_author_deleted_their_account_is_removed_without_an_email(
    admin_client: Client, mailoutbox: list[EmailMessage], django_capture_on_commit_callbacks: Callable[..., Any]
) -> None:
    slug = reported_curry()
    Recipe.objects.filter(slug=slug).update(created_by=None)
    mailoutbox.clear()

    with django_capture_on_commit_callbacks(execute=True):
        review(admin_client, 'remove', slug)

    assert (state_of(slug), mailoutbox) == (('private', 'removed', [True]), [])


@pytest.mark.django_db
def test_an_email_that_can_t_be_sent_is_logged_and_the_removal_stands(
    admin_client: Client,
    settings: Settings,
    caplog: pytest.LogCaptureFixture,
    django_capture_on_commit_callbacks: Callable[..., Any],
) -> None:
    slug = reported_curry()
    # Nothing listens on port 9, so the send fails as an unreachable mail server would.
    settings.MAILERS = {
        'default': {
            'BACKEND': 'django.core.mail.backends.smtp.EmailBackend',
            'OPTIONS': {'host': '127.0.0.1', 'port': 9, 'timeout': 1},
        }
    }

    with caplog.at_level(logging.ERROR), django_capture_on_commit_callbacks(execute=True):
        review(admin_client, 'remove', slug)

    logged = [record.getMessage() for record in caplog.records if record.name == 'recipes.services']
    assert logged == ["Couldn't send the report review email"]
    assert MILO not in caplog.text
    assert state_of(slug) == ('private', 'removed', [True])


@pytest.mark.django_db
@pytest.mark.parametrize('page', ['list', 'recipe'])
def test_the_reported_recipes_aren_t_there_for_an_account_that_isn_t_staff(page: str) -> None:
    slug = reported_curry()
    address = REPORTED
    if page == 'recipe':
        address = reverse('admin:recipes_reportedrecipe_change', args=[Recipe.objects.get(slug=slug).pk])
    jo = BrowserClient()
    jo.client.force_login(User.objects.get(email='jo@example.com'))

    response = jo.client.get(address, follow=True)

    assert response.status_code == 404


@pytest.mark.django_db
def test_a_seeded_member_has_a_recipe_staff_removed(test_accounts: Settings) -> None:
    sams = [{'title': "Sam's curry", 'visibility': 'public'}, {'title': "Sam's dal", 'visibility': 'public'}]
    body = seeded({'members': [{'key': 'sam', 'name': 'Sam', 'recipes': sams, 'removed': ["Sam's dal"]}]})
    sam = signed_in_as(body, 'sam')
    [curry, dal] = body['accounts']['sam']['recipes']

    response = sam.put(f'{RECIPES}{dal["slug"]}/visibility/', {'visibility': 'public'}, format='json')

    assert [recipe['title'] for recipe in sam.get(RECIPES).json()['results'] if recipe['title'][:3] == 'Sam'] == [
        "Sam's curry",
        "Sam's dal",
    ]
    assert (Recipe.objects.get(slug=curry['slug']).visibility, Recipe.objects.get(slug=dal['slug']).visibility) == (
        'public',
        'private',
    )
    assert response.json() == {
        'visibility': ['Staff removed this recipe from public view after a report, so it stays private.']
    }
