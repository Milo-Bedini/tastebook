import pytest
from django.test import Client
from pytest_django.fixtures import Settings

from households.models import User
from tests.two_factor import set_up_two_factor

SECRET = 'bypass-secret-for-tests'


@pytest.fixture
def admin_client(admin_user: User) -> Client:
    """A superuser who has passed both factors, as the admin requires."""
    # Tastebook's accounts have no password; with one, allauth would ask it again before setting up the authenticator.
    admin_user.set_unusable_password()
    admin_user.save()
    client = Client()
    client.force_login(admin_user)
    set_up_two_factor(client)
    return client


@pytest.fixture
def test_accounts(settings: Settings) -> Settings:
    settings.TEST_ACCOUNTS_ENABLED = True
    settings.TEST_ACCOUNT_CODES_NEED_SECRET = False
    settings.TEST_ACCOUNT_SECRET = SECRET
    return settings
