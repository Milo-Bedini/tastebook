from collections.abc import Iterator

import pytest
from django.core.cache import cache
from pytest_django.fixtures import Settings
from rest_framework.test import APIClient

from households.models import StoredSignInCode
from tests.conftest import SECRET
from tests.test_accounts import BrowserClient

CODE = '/api/test-accounts/code/'


@pytest.fixture(autouse=True)
def no_rate_limits_carried_over() -> Iterator[None]:
    # allauth sends one verification email an address every 3 minutes, counted in the cache.
    cache.clear()
    yield
    cache.clear()


def stored_code(email: str) -> str:
    return StoredSignInCode.objects.get(email=email).code


@pytest.mark.django_db
def test_a_local_run_reads_a_test_accounts_latest_code(test_accounts: Settings) -> None:
    browser = BrowserClient()
    browser.post('signup', {'email': 'cook@tastebook.test'})
    first = APIClient().get(CODE, {'email': 'cook@tastebook.test'})
    first_code = stored_code('cook@tastebook.test')
    browser.post('email/verify', {'key': first_code})
    browser.delete('session')
    browser.post('code/request', {'email': 'cook@tastebook.test'})

    second = APIClient().get(CODE, {'email': 'cook@tastebook.test'})

    assert (first.status_code, first.json()) == (200, {'code': first_code})
    assert (second.status_code, second.json()) == (200, {'code': stored_code('cook@tastebook.test')})
    assert StoredSignInCode.objects.count() == 1


@pytest.mark.django_db
def test_a_preview_reads_a_code_with_the_bypass_secret(test_accounts: Settings) -> None:
    test_accounts.TEST_ACCOUNT_CODES_NEED_SECRET = True
    BrowserClient().post('signup', {'email': 'cook@tastebook.test'})

    response = APIClient().get(CODE, {'email': 'cook@tastebook.test'}, headers={'X-Test-Account-Secret': SECRET})

    assert (response.status_code, response.json()) == (200, {'code': stored_code('cook@tastebook.test')})


@pytest.mark.django_db
@pytest.mark.parametrize(
    ('overrides', 'email', 'header'),
    [
        ({'TEST_ACCOUNTS_ENABLED': False}, 'cook@tastebook.test', None),
        ({'TEST_ACCOUNT_CODES_NEED_SECRET': True}, 'cook@tastebook.test', None),
        ({'TEST_ACCOUNT_CODES_NEED_SECRET': True}, 'cook@tastebook.test', 'wrong-secret'),
        ({'TEST_ACCOUNT_CODES_NEED_SECRET': True, 'TEST_ACCOUNT_SECRET': ''}, 'cook@tastebook.test', ''),
        ({}, 'sam@example.com', None),
        ({}, 'cook@sub.tastebook.test', None),
        ({}, 'baker@tastebook.test', None),
    ],
    ids=[
        'production',
        'preview-without-secret',
        'preview-with-wrong-secret',
        'preview-with-no-secret-set',
        'not-a-test-account',
        'subdomain-of-the-test-domain',
        'no-stored-code',
    ],
)
def test_a_code_is_not_found_unless_it_may_be_read(
    test_accounts: Settings, overrides: dict[str, object], email: str, header: str | None
) -> None:
    BrowserClient().post('signup', {'email': 'cook@tastebook.test'})
    StoredSignInCode.objects.update_or_create(email='sam@example.com', defaults={'code': '123456'})
    StoredSignInCode.objects.update_or_create(email='cook@sub.tastebook.test', defaults={'code': '123456'})
    for name, value in overrides.items():
        setattr(test_accounts, name, value)
    headers = {} if header is None else {'X-Test-Account-Secret': header}

    response = APIClient().get(CODE, {'email': email}, headers=headers)

    assert (response.status_code, response.json()) == (404, {'detail': 'Not found.'})
