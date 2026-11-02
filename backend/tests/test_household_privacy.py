"""Every endpoint, called by someone outside a household, answers none of that household's data and changes none of it.

ENDPOINTS lists every route the site answers; a new route fails test_every_endpoint_is_probed until it's listed with
the requests an outsider could try on it, so each slice that adds an endpoint adds it here.
"""

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

import pytest
from allauth.account.models import EmailAddress
from django.http import HttpResponse
from django.urls import URLPattern, URLResolver, get_resolver

from households.models import Household, Invite, User
from tests.test_accounts import BrowserClient
from tests.test_household import HOUSEHOLD, cancel_link, join, make_link, signed_up

ZEBEDEE = 'zebedee@example.com'
PHILIPPA = 'philippa@example.com'
HOUSEHOLD_NAME = 'The Quillfeathers'


@dataclass(frozen=True)
class Probe:
    """One request an outsider might try. `{member}`, `{dead_token}` and `{zebedee}` in its path or body are filled in
    with the Quillfeathers' own."""

    method: str
    path: str
    body: dict[str, str] = field(default_factory=dict)


def get(path: str) -> Probe:
    return Probe('get', path)


def post(path: str, body: dict[str, str] | None = None) -> Probe:
    return Probe('post', path, body or {})


def patch(path: str, body: dict[str, str]) -> Probe:
    return Probe('patch', path, body)


def delete(path: str, body: dict[str, str] | None = None) -> Probe:
    return Probe('delete', path, body or {})


AUTH = '/api/_allauth/browser/v1/auth'
ACCOUNT = '/api/_allauth/browser/v1/account'

# Each route as Django's URL resolver writes it, with what an outsider might try on it. The admin is one entry,
# `admin/*`, for every route under it: each page is behind staff sign-in and both factors, so it's probed on the pages
# that list accounts' data.
ENDPOINTS: dict[str, tuple[Probe, ...]] = {
    'admin/*': (get('/admin/'), get('/admin/account/emailaddress/'), get('/admin/mfa/authenticator/')),
    'api/health/': (get('/api/health/'),),
    'api/account/': (get('/api/account/'), patch('/api/account/', {'name': 'Taken'})),
    'api/household/': (get('/api/household/'), patch('/api/household/', {'name': 'Taken'})),
    'api/household/invite/': (post('/api/household/invite/'), delete('/api/household/invite/')),
    'api/household/leave/': (post('/api/household/leave/'),),
    'api/household/members/<int:member_id>/': (delete('/api/household/members/{member}/'),),
    # A live link shows its household to whoever holds it and lets them join (TAS-110): the link is the permission,
    # so only links that never were or no longer work are an outsider's to try.
    'api/invites/<str:token>/': (get('/api/invites/{dead_token}/'), get('/api/invites/never-an-invite/')),
    'api/invites/<str:token>/join/': (
        post('/api/invites/{dead_token}/join/'),
        post('/api/invites/never-an-invite/join/'),
    ),
    'api/test-accounts/code/': (get('/api/test-accounts/code/?email={zebedee}'),),
    'api/_allauth/browser/v1/config': (get('/api/_allauth/browser/v1/config'),),
    'api/_allauth/browser/v1/auth/session': (get(f'{AUTH}/session'),),
    'api/_allauth/browser/v1/auth/reauthenticate': (post(f'{AUTH}/reauthenticate', {'password': 'guess'}),),
    'api/_allauth/browser/v1/auth/code/request': (post(f'{AUTH}/code/request', {'email': '{zebedee}'}),),
    'api/_allauth/browser/v1/auth/code/confirm': (post(f'{AUTH}/code/confirm', {'code': '000000'}),),
    'api/_allauth/browser/v1/auth/code/resend': (post(f'{AUTH}/code/resend'),),
    'api/_allauth/browser/v1/auth/signup': (post(f'{AUTH}/signup', {'email': '{zebedee}'}),),
    'api/_allauth/browser/v1/auth/email/verify': (
        get(f'{AUTH}/email/verify'),
        post(f'{AUTH}/email/verify', {'key': '000000'}),
    ),
    'api/_allauth/browser/v1/auth/email/verify/resend': (post(f'{AUTH}/email/verify/resend'),),
    'api/_allauth/browser/v1/auth/login': (post(f'{AUTH}/login', {'email': '{zebedee}', 'password': 'guess'}),),
    'api/_allauth/browser/v1/auth/password/request': (post(f'{AUTH}/password/request', {'email': '{zebedee}'}),),
    'api/_allauth/browser/v1/auth/password/reset': (
        get(f'{AUTH}/password/reset'),
        post(f'{AUTH}/password/reset', {'key': 'guess', 'password': 'a-new-password-1'}),
    ),
    'api/_allauth/browser/v1/auth/phone/verify': (post(f'{AUTH}/phone/verify', {'code': '000000'}),),
    'api/_allauth/browser/v1/auth/phone/verify/resend': (post(f'{AUTH}/phone/verify/resend'),),
    'api/_allauth/browser/v1/auth/provider/signup': (get(f'{AUTH}/provider/signup'), post(f'{AUTH}/provider/signup')),
    'api/_allauth/browser/v1/auth/provider/redirect': (
        post(f'{AUTH}/provider/redirect', {'provider': 'google', 'callback_url': '/', 'process': 'connect'}),
    ),
    'api/_allauth/browser/v1/auth/provider/token': (post(f'{AUTH}/provider/token'),),
    'api/_allauth/browser/v1/auth/2fa/authenticate': (post(f'{AUTH}/2fa/authenticate', {'code': '000000'}),),
    'api/_allauth/browser/v1/auth/2fa/reauthenticate': (post(f'{AUTH}/2fa/reauthenticate', {'code': '000000'}),),
    'api/_allauth/browser/v1/account/email': (
        get(f'{ACCOUNT}/email'),
        post(f'{ACCOUNT}/email', {'email': '{zebedee}'}),
        delete(f'{ACCOUNT}/email', {'email': '{zebedee}'}),
    ),
    'api/_allauth/browser/v1/account/phone': (get(f'{ACCOUNT}/phone'),),
    'api/_allauth/browser/v1/account/password/change': (post(f'{ACCOUNT}/password/change', {'new_password': 'x'}),),
    'api/_allauth/browser/v1/account/providers': (
        get(f'{ACCOUNT}/providers'),
        delete(f'{ACCOUNT}/providers', {'provider': 'google', 'account': '{zebedee}'}),
    ),
    'api/_allauth/browser/v1/account/authenticators': (get(f'{ACCOUNT}/authenticators'),),
    'api/_allauth/browser/v1/account/authenticators/totp': (get(f'{ACCOUNT}/authenticators/totp'),),
    'api/_allauth/browser/v1/account/authenticators/recovery-codes': (get(f'{ACCOUNT}/authenticators/recovery-codes'),),
    'api/accounts/google/login/': (get('/api/accounts/google/login/'),),
    'api/accounts/google/login/callback/': (get('/api/accounts/google/login/callback/'),),
    'api/accounts/google/login/token/': (post('/api/accounts/google/login/token/'),),
    'api/recipes/': (get('/api/recipes/'),),
    'api/recipes/<slug:slug>/': (get('/api/recipes/no-such-recipe/'),),
    'api/cuisines/': (get('/api/cuisines/'),),
    'api/courses/': (get('/api/courses/'),),
    'api/ingredients/': (get('/api/ingredients/'),),
    'api/schema/': (get('/api/schema/'),),
    'api/schema/docs/': (get('/api/schema/docs/'),),
}


def routes(patterns: list[URLPattern | URLResolver], prefix: str = '') -> set[str]:
    """Every route under `patterns`, an include that ENDPOINTS lists whole as `<route>*`."""
    found: set[str] = set()
    for pattern in patterns:
        route = prefix + str(pattern.pattern)
        if not isinstance(pattern, URLResolver):
            found.add(route)
        elif f'{route}*' in ENDPOINTS:
            found.add(f'{route}*')
        else:
            found |= routes(pattern.url_patterns, route)
    return found


@dataclass(frozen=True)
class Quillfeathers:
    household: int
    member: int
    live_token: str
    dead_token: str


def the_quillfeathers() -> Quillfeathers:
    """Zebedee's household, renamed The Quillfeathers, with Philippa in it, a cancelled link and a live one."""
    zebedee = signed_up(ZEBEDEE, 'Zebedee')
    signed_up(PHILIPPA, 'Philippa')
    join(PHILIPPA, ZEBEDEE)
    zebedee.client.patch(HOUSEHOLD, {'name': HOUSEHOLD_NAME}, format='json', **zebedee.csrf_header())
    dead_token = make_link(zebedee).json()['invite']['token']
    cancel_link(zebedee)
    return Quillfeathers(
        household=User.objects.get(email=ZEBEDEE).household_id,
        member=User.objects.get(email=PHILIPPA).pk,
        live_token=make_link(zebedee).json()['invite']['token'],
        dead_token=dead_token,
    )


def what_they_hold(quillfeathers: Quillfeathers) -> dict[str, Any]:
    household = Household.objects.get(pk=quillfeathers.household)
    return {
        'name': household.name,
        'members': sorted(User.objects.filter(household=household).values_list('email', 'name')),
        'addresses': sorted(
            EmailAddress.objects.filter(user__household=household).values_list('user__email', 'email', 'verified')
        ),
        'invites': sorted(Invite.objects.filter(household=household).values_list('token', 'cancelled_at')),
    }


def call(browser: BrowserClient, probe: Probe, quillfeathers: Quillfeathers) -> HttpResponse:
    values = {
        'member': quillfeathers.member,
        'dead_token': quillfeathers.dead_token,
        'zebedee': ZEBEDEE,
    }
    body = {key: value.format(**values) for key, value in probe.body.items()}
    # A server error is answered as a browser gets it, so its body is checked like any other.
    browser.client.raise_request_exception = False
    send = getattr(browser.client, probe.method)
    return send(probe.path.format(**values), body or None, format='json', **browser.csrf_header())


def outsider_signed_out() -> BrowserClient:
    return BrowserClient()


def outsider_in_another_household() -> BrowserClient:
    return signed_up('jo@example.com', 'Jo')


# What a member sees of their household, and nobody else should: names, addresses and the live link.
SECRETS = (HOUSEHOLD_NAME, 'Zebedee', 'Philippa', ZEBEDEE, PHILIPPA)

PROBES = [
    pytest.param(probe, id=f'{probe.method.upper()} {probe.path}') for probes in ENDPOINTS.values() for probe in probes
]


def test_every_endpoint_is_probed() -> None:
    assert routes(get_resolver().url_patterns) == set(ENDPOINTS), (
        'List each new route in ENDPOINTS with the requests an outsider could try on it'
    )


@pytest.mark.django_db
def test_a_member_sees_what_outsiders_must_not() -> None:
    quillfeathers = the_quillfeathers()
    zebedee = BrowserClient()
    zebedee.client.force_login(User.objects.get(email=ZEBEDEE))

    seen = zebedee.client.get(HOUSEHOLD).content.decode()

    assert [secret for secret in (*SECRETS, quillfeathers.live_token) if secret in seen] == [
        HOUSEHOLD_NAME,
        'Zebedee',
        'Philippa',
        quillfeathers.live_token,
    ]


@pytest.mark.django_db
@pytest.mark.parametrize(
    'outsider',
    [
        pytest.param(outsider_signed_out, id='signed out'),
        pytest.param(outsider_in_another_household, id='another household'),
    ],
)
@pytest.mark.parametrize('probe', PROBES)
def test_no_endpoint_shows_or_changes_a_household_for_an_outsider(
    probe: Probe, outsider: Callable[[], BrowserClient]
) -> None:
    quillfeathers = the_quillfeathers()
    browser = outsider()
    before = what_they_hold(quillfeathers)

    response = call(browser, probe, quillfeathers)
    seen = response.content.decode()

    assert [secret for secret in (*SECRETS, quillfeathers.live_token) if secret in seen] == []
    assert what_they_hold(quillfeathers) == before
