from collections.abc import Callable
from typing import Any

import pytest
from django.core.mail import EmailMessage
from django.http import HttpResponse

from households.models import Household, User
from tests.test_accounts import BrowserClient, save_name, sign_up

HOUSEHOLD = '/api/household/'
LEAVE = '/api/household/leave/'


def signed_up(email: str, name: str) -> BrowserClient:
    browser = BrowserClient()
    sign_up(browser, email)
    save_name(browser, name)
    return browser


def rename(browser: BrowserClient, body: dict[str, Any]) -> HttpResponse:
    return browser.client.patch(HOUSEHOLD, body, format='json', **browser.csrf_header())


def member(email: str) -> str:
    return f'/api/household/members/{User.objects.get(email=email).pk}/'


def remove(browser: BrowserClient, path: str) -> HttpResponse:
    return browser.client.delete(path, **browser.csrf_header())


def leave(browser: BrowserClient) -> HttpResponse:
    return browser.client.post(LEAVE, **browser.csrf_header())


def household_id_of(email: str) -> int | None:
    return User.objects.get(email=email).household_id


def join(email: str, household_of: str) -> None:
    # Joining doesn't exist yet, so the test moves the account itself.
    User.objects.filter(email=email).update(household=User.objects.get(email=household_of).household)


@pytest.mark.django_db
def test_a_new_account_sees_its_household_of_one() -> None:
    milo = signed_up('sam@example.com', 'Milo')

    response = milo.client.get(HOUSEHOLD)

    assert (response.status_code, response.json()) == (
        200,
        {
            'id': User.objects.get(email='sam@example.com').household_id,
            'name': "Milo's household",
            'members': [{'id': User.objects.get(email='sam@example.com').pk, 'name': 'Milo', 'is_you': True}],
        },
    )


@pytest.mark.django_db
def test_members_come_you_first_then_by_name() -> None:
    milo = signed_up('milo@example.com', 'Milo')
    signed_up('zoe@example.com', 'zoe')
    signed_up('ann@example.com', 'Ann')
    join('zoe@example.com', 'milo@example.com')
    join('ann@example.com', 'milo@example.com')

    members = milo.client.get(HOUSEHOLD).json()['members']

    assert [member['name'] for member in members] == ['Milo', 'Ann', 'zoe']
    assert [member['is_you'] for member in members] == [True, False, False]
    assert [sorted(member) for member in members] == [['id', 'is_you', 'name']] * 3


@pytest.mark.django_db
def test_each_account_sees_only_its_own_household() -> None:
    signed_up('milo@example.com', 'Milo')
    jo = signed_up('jo@example.com', 'Jo')

    response = jo.client.get(HOUSEHOLD)

    assert response.json() == {
        'id': User.objects.get(email='jo@example.com').household_id,
        'name': "Jo's household",
        'members': [{'id': User.objects.get(email='jo@example.com').pk, 'name': 'Jo', 'is_you': True}],
    }


@pytest.mark.django_db
def test_any_member_renames_the_household() -> None:
    milo = signed_up('milo@example.com', 'Milo')
    ann = signed_up('ann@example.com', 'Ann')
    join('ann@example.com', 'milo@example.com')

    renamed = rename(milo, {'name': '  The Bedinis '})
    seen_by_ann = ann.client.get(HOUSEHOLD)

    assert (renamed.status_code, renamed.json()['name']) == (200, 'The Bedinis')
    assert User.objects.get(email='milo@example.com').household.name == 'The Bedinis'
    assert seen_by_ann.json()['name'] == 'The Bedinis'


@pytest.mark.django_db
@pytest.mark.parametrize('body', [{}, {'name': ''}, {'name': '   '}, {'name': 'a' * 101}])
def test_a_missing_blank_or_long_name_is_refused(body: dict[str, Any]) -> None:
    milo = signed_up('milo@example.com', 'Milo')

    response = rename(milo, body)

    assert (response.status_code, 'name' in response.json()) == (400, True)
    assert Household.objects.get().name == "Milo's household"


@pytest.mark.django_db
def test_a_name_of_100_characters_is_saved() -> None:
    milo = signed_up('milo@example.com', 'Milo')

    response = rename(milo, {'name': 'a' * 100})

    assert (response.status_code, response.json()['name']) == (200, 'a' * 100)


@pytest.mark.django_db
@pytest.mark.parametrize('method', ['get', 'patch'])
def test_a_visitor_is_refused(method: str) -> None:
    signed_up('milo@example.com', 'Milo')
    visitor = BrowserClient()

    response = getattr(visitor.client, method)(HOUSEHOLD, {'name': 'Taken'}, format='json', **visitor.csrf_header())

    assert response.status_code == 403
    assert Household.objects.get().name == "Milo's household"


@pytest.mark.django_db
def test_an_account_with_no_household_gets_404() -> None:
    browser = BrowserClient()
    sign_up(browser, 'sam@example.com')

    assert browser.client.get(HOUSEHOLD).status_code == 404


@pytest.mark.django_db
def test_renaming_without_the_csrf_header_is_refused() -> None:
    milo = signed_up('milo@example.com', 'Milo')

    response = milo.client.patch(HOUSEHOLD, {'name': 'The Bedinis'}, format='json')

    assert response.status_code == 403
    assert Household.objects.get().name == "Milo's household"


@pytest.mark.django_db
def test_any_member_removes_another_into_a_household_of_their_own() -> None:
    milo = signed_up('milo@example.com', 'Milo')
    ann = signed_up('ann@example.com', 'Ann')
    join('ann@example.com', 'milo@example.com')
    rename(milo, {'name': 'The Bedinis'})
    bedinis = household_id_of('milo@example.com')

    response = remove(milo, member('ann@example.com'))
    seen_by_ann = ann.client.get(HOUSEHOLD).json()

    assert (response.status_code, response.json()) == (
        200,
        {
            'id': bedinis,
            'name': 'The Bedinis',
            'members': [{'id': User.objects.get(email='milo@example.com').pk, 'name': 'Milo', 'is_you': True}],
        },
    )
    assert seen_by_ann['name'] == "Ann's household"
    assert seen_by_ann['members'] == [
        {'id': User.objects.get(email='ann@example.com').pk, 'name': 'Ann', 'is_you': True}
    ]
    assert seen_by_ann['id'] != bedinis


@pytest.mark.django_db
def test_a_removed_member_is_emailed_who_removed_them_and_from_where(
    mailoutbox: list[EmailMessage], django_capture_on_commit_callbacks: Callable[..., Any]
) -> None:
    milo = signed_up('milo@example.com', 'Milo')
    signed_up('ann@example.com', 'Ann')
    join('ann@example.com', 'milo@example.com')
    rename(milo, {'name': 'The Bedinis'})
    mailoutbox.clear()

    with django_capture_on_commit_callbacks(execute=True):
        remove(milo, member('ann@example.com'))

    assert len(mailoutbox) == 1
    [email] = mailoutbox
    assert email.to == ['ann@example.com']
    assert email.subject == 'You were removed from The Bedinis'
    assert 'Milo removed you from The Bedinis on Tastebook.' in email.body
    assert "You're now in a household of your own, Ann's household." in email.body
    assert 'milo@example.com' not in email.body


@pytest.mark.django_db
def test_an_apostrophe_in_the_household_name_survives_the_email(
    mailoutbox: list[EmailMessage], django_capture_on_commit_callbacks: Callable[..., Any]
) -> None:
    milo = signed_up('milo@example.com', 'Milo')
    signed_up('ann@example.com', 'Ann')
    join('ann@example.com', 'milo@example.com')
    mailoutbox.clear()

    with django_capture_on_commit_callbacks(execute=True):
        remove(milo, member('ann@example.com'))

    assert [email.subject for email in mailoutbox] == ["You were removed from Milo's household"]


@pytest.mark.django_db
@pytest.mark.parametrize(
    'path',
    [
        pytest.param(lambda: member('milo@example.com'), id='yourself'),
        pytest.param(lambda: member('jo@example.com'), id='another household'),
        pytest.param(lambda: '/api/household/members/999999/', id='nobody'),
    ],
)
def test_removing_anyone_but_another_member_answers_404(
    path: Callable[[], str],
    mailoutbox: list[EmailMessage],
    django_capture_on_commit_callbacks: Callable[..., Any],
) -> None:
    milo = signed_up('milo@example.com', 'Milo')
    signed_up('ann@example.com', 'Ann')
    signed_up('jo@example.com', 'Jo')
    join('ann@example.com', 'milo@example.com')
    before = {email: household_id_of(email) for email in ['milo@example.com', 'ann@example.com', 'jo@example.com']}
    mailoutbox.clear()

    with django_capture_on_commit_callbacks(execute=True):
        response = remove(milo, path())

    assert response.status_code == 404
    assert {email: household_id_of(email) for email in before} == before
    assert mailoutbox == []


@pytest.mark.django_db
@pytest.mark.parametrize('with_csrf_header', [False, True], ids=['no csrf header', 'signed out'])
def test_removing_is_refused_signed_out_or_without_the_csrf_header(with_csrf_header: bool) -> None:
    milo = signed_up('milo@example.com', 'Milo')
    signed_up('ann@example.com', 'Ann')
    join('ann@example.com', 'milo@example.com')
    browser = BrowserClient() if with_csrf_header else milo
    headers = browser.csrf_header() if with_csrf_header else {}

    response = browser.client.delete(member('ann@example.com'), **headers)

    assert response.status_code == 403
    assert household_id_of('ann@example.com') == household_id_of('milo@example.com')


@pytest.mark.django_db
def test_a_member_leaves_into_a_household_of_their_own(mailoutbox: list[EmailMessage]) -> None:
    milo = signed_up('milo@example.com', 'Milo')
    ann = signed_up('ann@example.com', 'Ann')
    join('ann@example.com', 'milo@example.com')
    households = Household.objects.count()
    mailoutbox.clear()

    response = leave(ann)
    seen_by_milo = milo.client.get(HOUSEHOLD).json()

    assert response.status_code == 200
    assert response.json()['name'] == "Ann's household"
    assert response.json()['members'] == [
        {'id': User.objects.get(email='ann@example.com').pk, 'name': 'Ann', 'is_you': True}
    ]
    assert [person['name'] for person in seen_by_milo['members']] == ['Milo']
    # Milo's household stays, since he's still in it; only Ann's new one is added.
    assert seen_by_milo['id'] == household_id_of('milo@example.com')
    assert Household.objects.count() == households + 1
    assert mailoutbox == []


@pytest.mark.django_db
def test_the_last_member_leaving_deletes_the_household() -> None:
    milo = signed_up('milo@example.com', 'Milo')
    old = household_id_of('milo@example.com')

    response = leave(milo)

    assert response.status_code == 200
    assert response.json()['name'] == "Milo's household"
    assert response.json()['id'] != old
    assert Household.objects.filter(pk=old).exists() is False
    assert Household.objects.count() == 1


@pytest.mark.django_db
@pytest.mark.parametrize('with_csrf_header', [False, True], ids=['no csrf header', 'signed out'])
def test_leaving_is_refused_signed_out_or_without_the_csrf_header(with_csrf_header: bool) -> None:
    milo = signed_up('milo@example.com', 'Milo')
    ann = signed_up('ann@example.com', 'Ann')
    join('ann@example.com', 'milo@example.com')
    browser = BrowserClient() if with_csrf_header else ann
    headers = browser.csrf_header() if with_csrf_header else {}

    response = browser.client.post(LEAVE, **headers)

    assert response.status_code == 403
    assert household_id_of('ann@example.com') == household_id_of('milo@example.com')
    assert milo.client.get(HOUSEHOLD).status_code == 200


@pytest.mark.django_db
def test_an_account_with_no_household_cannot_leave() -> None:
    browser = BrowserClient()
    sign_up(browser, 'sam@example.com')

    assert leave(browser).status_code == 404
