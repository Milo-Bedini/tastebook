from dataclasses import dataclass
from datetime import timedelta

import pytest
from django.http import HttpResponse
from django.utils import timezone

from households.models import Household, User
from recipe_collections.models import RecipeList
from tests.test_accounts import BrowserClient
from tests.test_household import (
    HOUSEHOLD,
    cancel_link,
    household_id_of,
    join,
    make_link,
    member,
    remove,
    signed_up,
)


def lookup(browser: BrowserClient, token: str) -> HttpResponse:
    return browser.client.get(f'/api/invites/{token}/')


def join_through(browser: BrowserClient, token: str) -> HttpResponse:
    return browser.client.post(f'/api/invites/{token}/join/', **browser.csrf_header())


def make_list(browser: BrowserClient, name: str, scope: str) -> None:
    browser.client.post('/api/lists/', {'name': name, 'scope': scope}, format='json', **browser.csrf_header())


def account_id(email: str) -> int:
    return User.objects.get(email=email).pk


@dataclass
class Bedinis:
    milo: BrowserClient
    ann: BrowserClient
    token: str


def bedinis_link() -> Bedinis:
    """Milo's household, renamed The Bedinis, with Ann in it, and its live link."""
    milo = signed_up('milo@example.com', 'Milo')
    ann = signed_up('ann@example.com', 'Ann')
    join('ann@example.com', 'milo@example.com')
    milo.client.patch(HOUSEHOLD, {'name': 'The Bedinis'}, format='json', **milo.csrf_header())
    return Bedinis(milo, ann, make_link(milo).json()['invite']['token'])


def kill(bedinis: Bedinis, monkeypatch: pytest.MonkeyPatch, status: str) -> None:
    """Ends the link: 7 days and a second on, or cancelled by Milo."""
    if status == 'expired':
        later = timezone.now() + timedelta(days=7, seconds=1)
        monkeypatch.setattr(timezone, 'now', lambda: later)
    else:
        cancel_link(bedinis.milo)


@pytest.mark.django_db
def test_a_live_link_shows_someone_signed_in_the_household_and_its_members() -> None:
    bedinis = bedinis_link()
    jo = signed_up('jo@example.com', 'Jo')

    response = lookup(jo, bedinis.token)

    assert (response.status_code, response.json()) == (
        200,
        {
            'status': 'live',
            'is_member': False,
            'household': {
                'name': 'The Bedinis',
                'members': [
                    {'id': account_id('ann@example.com'), 'name': 'Ann', 'is_you': False},
                    {'id': account_id('milo@example.com'), 'name': 'Milo', 'is_you': False},
                ],
            },
            'recipes_to_copy': 0,
            'lists_to_delete': 0,
        },
    )


@pytest.mark.django_db
@pytest.mark.parametrize('status', ['live', 'expired', 'cancelled'])
def test_signed_out_a_link_shows_only_its_status(monkeypatch: pytest.MonkeyPatch, status: str) -> None:
    bedinis = bedinis_link()
    if status != 'live':
        kill(bedinis, monkeypatch, status)

    response = lookup(BrowserClient(), bedinis.token)

    assert (response.status_code, response.json()) == (
        200,
        {'status': status, 'is_member': False, 'household': None, 'recipes_to_copy': 0, 'lists_to_delete': 0},
    )


@pytest.mark.django_db
@pytest.mark.parametrize('status', ['expired', 'cancelled'])
def test_a_dead_link_shows_someone_signed_in_only_its_status(monkeypatch: pytest.MonkeyPatch, status: str) -> None:
    bedinis = bedinis_link()
    jo = signed_up('jo@example.com', 'Jo')
    kill(bedinis, monkeypatch, status)

    response = lookup(jo, bedinis.token)

    assert (response.status_code, response.json()) == (
        200,
        {'status': status, 'is_member': False, 'household': None, 'recipes_to_copy': 0, 'lists_to_delete': 0},
    )


@pytest.mark.django_db
def test_a_member_opening_their_own_link_is_told_they_are_in_it() -> None:
    bedinis = bedinis_link()

    body = lookup(bedinis.milo, bedinis.token).json()

    assert (body['is_member'], body['household']['name']) == (True, 'The Bedinis')
    assert body['household']['members'][0] == {'id': account_id('milo@example.com'), 'name': 'Milo', 'is_you': True}


@pytest.mark.django_db
def test_an_unknown_token_answers_404() -> None:
    bedinis_link()
    jo = signed_up('jo@example.com', 'Jo')

    assert (lookup(jo, 'not-a-token').status_code, join_through(jo, 'not-a-token').status_code) == (404, 404)


@pytest.mark.django_db
def test_joining_moves_the_account_in_and_deletes_the_household_it_left_empty() -> None:
    bedinis = bedinis_link()
    joined = household_id_of('milo@example.com')
    jo = signed_up('jo@example.com', 'Jo')
    old = household_id_of('jo@example.com')

    response = join_through(jo, bedinis.token)

    body = response.json()
    assert (response.status_code, body['id'], body['name']) == (200, joined, 'The Bedinis')
    assert [(each['name'], each['is_you']) for each in body['members']] == [
        ('Jo', True),
        ('Ann', False),
        ('Milo', False),
    ]
    assert household_id_of('jo@example.com') == joined
    assert Household.objects.filter(pk=old).exists() is False
    assert len(bedinis.milo.client.get(HOUSEHOLD).json()['members']) == 3
    assert lookup(jo, bedinis.token).json()['status'] == 'live'


@pytest.mark.django_db
def test_joining_from_a_household_with_others_leaves_them_in_it() -> None:
    bedinis = bedinis_link()
    jo = signed_up('jo@example.com', 'Jo')
    kim = signed_up('kim@example.com', 'Kim')
    join('kim@example.com', 'jo@example.com')
    old = household_id_of('jo@example.com')

    join_through(jo, bedinis.token)

    assert Household.objects.filter(pk=old).exists() is True
    assert [each['name'] for each in kim.client.get(HOUSEHOLD).json()['members']] == ['Kim']


@pytest.mark.django_db
@pytest.mark.parametrize('status', ['expired', 'cancelled'])
def test_a_dead_link_answers_409_and_nobody_moves(monkeypatch: pytest.MonkeyPatch, status: str) -> None:
    bedinis = bedinis_link()
    jo = signed_up('jo@example.com', 'Jo')
    old = household_id_of('jo@example.com')
    kill(bedinis, monkeypatch, status)

    response = join_through(jo, bedinis.token)

    assert response.status_code == 409
    assert household_id_of('jo@example.com') == old


@pytest.mark.django_db
def test_a_member_joining_their_own_household_stays_put() -> None:
    bedinis = bedinis_link()
    households = Household.objects.count()

    response = join_through(bedinis.ann, bedinis.token)

    assert (response.status_code, response.json()['name']) == (200, 'The Bedinis')
    assert Household.objects.count() == households


@pytest.mark.django_db
@pytest.mark.parametrize('signed_out', [False, True], ids=['no csrf header', 'signed out'])
def test_joining_is_refused_signed_out_or_without_the_csrf_header(signed_out: bool) -> None:
    bedinis = bedinis_link()
    jo = signed_up('jo@example.com', 'Jo')
    old = household_id_of('jo@example.com')
    browser = BrowserClient() if signed_out else jo
    headers = browser.csrf_header() if signed_out else {}

    response = browser.client.post(f'/api/invites/{bedinis.token}/join/', **headers)

    assert response.status_code == 403
    assert User.objects.filter(household_id=household_id_of('milo@example.com')).count() == 2
    assert household_id_of('jo@example.com') == old


@pytest.mark.django_db
def test_a_removed_member_finds_the_link_cancelled() -> None:
    bedinis = bedinis_link()
    remove(bedinis.milo, member('ann@example.com'))

    assert lookup(bedinis.ann, bedinis.token).json() == {
        'status': 'cancelled',
        'is_member': False,
        'household': None,
        'recipes_to_copy': 0,
        'lists_to_delete': 0,
    }


@pytest.mark.django_db
@pytest.mark.parametrize(
    ('ann_stays', 'household_lists', 'deleted'),
    [
        pytest.param(False, 2, 2, id='only member'),
        pytest.param(False, 1, 1, id='only member, one list'),
        pytest.param(False, 0, 0, id='only member, no lists'),
        pytest.param(True, 2, 0, id='Ann stays with the lists'),
    ],
)
def test_a_link_says_how_many_lists_joining_would_delete(ann_stays: bool, household_lists: int, deleted: int) -> None:
    milo = signed_up('milo@example.com', 'Milo')
    if ann_stays:
        signed_up('ann@example.com', 'Ann')
        join('ann@example.com', 'milo@example.com')
    for number in range(household_lists):
        make_list(milo, f'Bakes {number}', 'household')
    # His own lists come with him.
    make_list(milo, 'Weeknights', 'personal')
    jo = signed_up('jo@example.com', 'Jo')
    token = make_link(jo).json()['invite']['token']

    assert lookup(milo, token).json()['lists_to_delete'] == deleted
    assert lookup(jo, token).json()['lists_to_delete'] == 0
    assert lookup(BrowserClient(), token).json()['lists_to_delete'] == 0

    old = household_id_of('milo@example.com')
    join_through(milo, token)

    assert RecipeList.objects.filter(household_id=old).count() == household_lists - deleted
