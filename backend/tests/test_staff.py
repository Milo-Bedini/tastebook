import re
from collections.abc import Iterator
from io import StringIO
from typing import Any
from urllib.parse import quote

import pytest
from allauth.account.models import EmailAddress
from allauth.mfa.models import Authenticator
from django.core import mail
from django.core.cache import cache
from django.core.management import call_command
from django.core.management.base import CommandError
from django.http import HttpResponse
from django.test import Client
from rest_framework.test import APIClient

from households.models import User
from tests.two_factor import RECOVERY_CODE, current_code, set_up_two_factor, setup_key

AUTH = '/api/_allauth/browser/v1/auth'
CODE_SUBJECT = re.compile(r'Your Tastebook code is (\d{6})')
QR_CODE = re.compile(r'<img src="data:image/svg\+xml;base64,[A-Za-z0-9+/=]+"')


@pytest.fixture(autouse=True)
def no_rate_limits_carried_over() -> Iterator[None]:
    cache.clear()
    yield
    cache.clear()


class BrowserClient:
    """Calls allauth's browser API as the SPA does: session cookies, and the CSRF cookie sent back as a header."""

    def __init__(self) -> None:
        self.client = APIClient(enforce_csrf_checks=True)
        self.get('session')

    def csrf_header(self) -> dict[str, str]:
        return {'HTTP_X_CSRFTOKEN': self.client.cookies['csrftoken'].value}

    def get(self, path: str) -> HttpResponse:
        return self.client.get(f'{AUTH}/{path}')

    def post(self, path: str, body: dict[str, Any]) -> HttpResponse:
        return self.client.post(f'{AUTH}/{path}', body, format='json', **self.csrf_header())


def emailed_code(to: str) -> str:
    sent = [message for message in mail.outbox if message.to == [to]]
    match = CODE_SUBJECT.fullmatch(sent[-1].subject)
    assert match, sent[-1].subject
    return match.group(1)


def pending_flow(response: HttpResponse) -> str | None:
    return next((flow['id'] for flow in response.json()['data']['flows'] if flow.get('is_pending')), None)


def sign_in_with_email_code(browser: BrowserClient, email: str) -> HttpResponse:
    browser.post('code/request', {'email': email})
    return browser.post('code/confirm', {'code': emailed_code(email)})


def account(email: str, **fields: Any) -> User:
    """An account as signing up leaves it: its address checked."""
    user = User.objects.create_user(email, **fields)
    EmailAddress.objects.create(user=user, email=email, verified=True, primary=True)
    return user


def staff(email: str = 'sam@example.com') -> User:
    return account(email, is_staff=True, is_superuser=True)


def signed_in(account: User) -> Client:
    client = Client()
    client.force_login(account)
    return client


def staff_with_authenticator() -> tuple[User, str, list[str]]:
    """A staff account that has set up two-factor sign-in, signed in from another browser."""
    sam = staff()
    key, recovery_codes = set_up_two_factor(signed_in(sam))
    return sam, key, recovery_codes


def page(response: HttpResponse) -> str:
    return response.content.decode()


def run(command: str, email: str) -> str:
    output = StringIO()
    call_command(command, email, stdout=output)
    return output.getvalue().strip()


@pytest.mark.django_db
def test_make_staff_makes_an_existing_account_staff_and_superuser() -> None:
    User.objects.create_user('sam@example.com')

    output = run('make_staff', 'Sam@Example.com')

    account = User.objects.get(email='sam@example.com')
    assert (account.is_staff, account.is_superuser) == (True, True)
    assert output == 'Sam@Example.com is now staff. Open /admin/ to set up two-factor sign-in.'


@pytest.mark.parametrize('command', ['make_staff', 'reset_two_factor'])
@pytest.mark.django_db
def test_the_staff_commands_refuse_an_address_with_no_account(command: str) -> None:
    with pytest.raises(CommandError) as error:
        run(command, 'nobody@example.com')

    assert str(error.value) == 'No account uses nobody@example.com. Sign up in the app with it first.'


@pytest.mark.django_db
def test_reset_two_factor_says_so_when_the_account_has_no_authenticator() -> None:
    User.objects.create_user('sam@example.com', is_staff=True)

    assert run('reset_two_factor', 'sam@example.com') == 'sam@example.com has no authenticator.'


@pytest.mark.django_db
def test_reset_two_factor_leaves_other_accounts_authenticators() -> None:
    sam = User.objects.create_user('sam@example.com', is_staff=True)
    alex = User.objects.create_user('alex@example.com', is_staff=True)
    for account in (sam, alex):
        Authenticator.objects.create(user=account, type=Authenticator.Type.TOTP, data={})
        Authenticator.objects.create(user=account, type=Authenticator.Type.RECOVERY_CODES, data={})

    output = run('reset_two_factor', 'sam@example.com')

    assert output == (
        "Removed sam@example.com's authenticator and recovery codes. "
        'They set up a new one the next time they open /admin/.'
    )
    assert list(Authenticator.objects.values_list('user__email', flat=True).distinct()) == ['alex@example.com']


@pytest.mark.django_db
def test_the_admin_sends_someone_signed_out_to_the_apps_sign_in() -> None:
    response = Client().get('/admin/', follow=True)

    assert response.redirect_chain[-1] == ('/sign-in?next=%2Fadmin%2F', 302)


@pytest.mark.parametrize(
    ('requested', 'sent_to'),
    [
        ('/admin/recipes/recipe/', '/sign-in?next=%2Fadmin%2Frecipes%2Frecipe%2F'),
        ('https://evil.example/', '/sign-in?next=%2Fadmin%2F'),
        ('//evil.example/admin/', '/sign-in?next=%2Fadmin%2F'),
        ('/recipes/', '/sign-in?next=%2Fadmin%2F'),
    ],
)
@pytest.mark.django_db
def test_the_admin_only_sends_sign_in_back_to_an_admin_address(requested: str, sent_to: str) -> None:
    response = Client().get(f'/admin/login/?next={quote(requested, safe="")}')

    assert (response.status_code, response['Location']) == (302, sent_to)


@pytest.mark.parametrize('address', ['/admin/', '/admin/login/', '/admin/two-factor/', '/admin/recipes/recipe/'])
@pytest.mark.django_db
def test_the_admin_isnt_there_for_an_account_that_isnt_staff(address: str) -> None:
    client = signed_in(User.objects.create_user('alex@example.com'))

    assert client.get(address, follow=True).status_code == 404


@pytest.mark.django_db
def test_staff_with_no_authenticator_are_asked_to_set_one_up() -> None:
    response = signed_in(staff()).get('/admin/', follow=True)

    html = page(response)
    assert response.status_code == 200
    assert 'Set up two-factor sign-in' in html
    assert setup_key(html)
    assert QR_CODE.search(html)


@pytest.mark.django_db
def test_setting_up_with_a_wrong_code_keeps_the_key_and_says_so() -> None:
    client = signed_in(staff())
    key = setup_key(page(client.get('/admin/two-factor/')))
    wrong = '000000' if current_code(key) != '000000' else '111111'

    response = client.post('/admin/two-factor/', {'code': wrong})

    html = page(response)
    assert response.status_code == 200
    assert 'Set up two-factor sign-in' in html
    assert 'Incorrect code.' in html
    assert setup_key(html) == key


@pytest.mark.django_db
def test_setting_up_with_the_right_code_shows_recovery_codes_then_opens_the_admin() -> None:
    client = signed_in(staff())
    key = setup_key(page(client.get('/admin/two-factor/?next=/admin/')))

    response = client.post('/admin/two-factor/?next=/admin/', {'code': current_code(key)})

    html = page(response)
    codes = RECOVERY_CODE.findall(html)
    assert 'Save your recovery codes' in html
    assert (len(codes), len(set(codes))) == (10, 10)
    assert '<a href="/admin/" class="button">Open the admin</a>' in html
    index = client.get('/admin/')
    assert (index.status_code, 'Site administration' in page(index)) == (200, True)


@pytest.mark.django_db
def test_staff_who_signed_in_without_the_second_factor_give_it_in_the_admin() -> None:
    account, key, _ = staff_with_authenticator()
    client = signed_in(account)

    asked = client.get('/admin/', follow=True)
    answered = client.post('/admin/two-factor/?next=%2Fadmin%2F', {'code': current_code(key)})

    assert asked.status_code == 200
    assert 'Enter your two-factor code' in page(asked)
    assert 'Site administration' not in page(asked)
    assert (answered.status_code, answered['Location']) == (302, '/admin/')
    assert 'Site administration' in page(client.get('/admin/'))


@pytest.mark.django_db
def test_a_recovery_code_opens_the_admin_once() -> None:
    account, _, recovery_codes = staff_with_authenticator()

    first = signed_in(account).post('/admin/two-factor/', {'code': recovery_codes[0]})
    again = signed_in(account).post('/admin/two-factor/', {'code': recovery_codes[0]})

    assert (first.status_code, first['Location']) == (302, '/admin/')
    assert again.status_code == 200
    assert 'Incorrect code.' in page(again)


@pytest.mark.django_db
def test_staff_sign_in_asks_for_the_authenticators_code_and_then_opens_the_admin() -> None:
    _, key, _ = staff_with_authenticator()
    browser = BrowserClient()

    confirmed = sign_in_with_email_code(browser, 'sam@example.com')
    between = browser.client.get('/api/account/')
    authenticated = browser.post('2fa/authenticate', {'code': current_code(key)})
    admin = browser.client.get('/admin/')

    assert (confirmed.status_code, pending_flow(confirmed)) == (401, 'mfa_authenticate')
    assert between.json() == {'account': None}
    assert (authenticated.status_code, authenticated.json()['data']['user']['email']) == (200, 'sam@example.com')
    assert (admin.status_code, 'Site administration' in page(admin)) == (200, True)


@pytest.mark.django_db
def test_staff_sign_in_refuses_a_wrong_authenticator_code() -> None:
    _, key, _ = staff_with_authenticator()
    browser = BrowserClient()
    sign_in_with_email_code(browser, 'sam@example.com')
    wrong = '000000' if current_code(key) != '000000' else '111111'

    refused = browser.post('2fa/authenticate', {'code': wrong})

    assert (refused.status_code, refused.json()['errors'][0]['code']) == (400, 'incorrect_code')
    assert browser.client.get('/api/account/').json() == {'account': None}


@pytest.mark.django_db
def test_an_emailed_code_cant_stand_in_for_the_authenticator() -> None:
    _, key, _ = staff_with_authenticator()
    browser = BrowserClient()
    sign_in_with_email_code(browser, 'sam@example.com')
    browser.post('2fa/authenticate', {'code': current_code(key)})
    mail.outbox.clear()

    requested = browser.post('reauthenticate/code/request', {})

    assert (requested.status_code, mail.outbox) == (403, [])


@pytest.mark.django_db
def test_an_account_that_isnt_staff_signs_in_with_only_the_email_code() -> None:
    account('alex@example.com')

    confirmed = sign_in_with_email_code(BrowserClient(), 'alex@example.com')

    assert (confirmed.status_code, confirmed.json()['data']['user']['email']) == (200, 'alex@example.com')


@pytest.mark.django_db
def test_reset_two_factor_takes_the_admin_from_a_session_that_passed_both_factors() -> None:
    client = signed_in(staff())
    set_up_two_factor(client)
    assert 'Site administration' in page(client.get('/admin/'))

    output = run('reset_two_factor', 'sam@example.com')

    assert not Authenticator.objects.filter(user__email='sam@example.com').exists()
    assert output.startswith("Removed sam@example.com's authenticator")
    assert 'Set up two-factor sign-in' in page(client.get('/admin/', follow=True))

    # The factor this session passed is gone: a new authenticator set up elsewhere doesn't count for it.
    set_up_two_factor(signed_in(User.objects.get(email='sam@example.com')))
    assert 'Enter your two-factor code' in page(client.get('/admin/', follow=True))
