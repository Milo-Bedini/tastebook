import os

import pytest
from django.conf import settings as django_settings
from django.test import Client
from pytest_django.fixtures import Settings

from households.models import User
from tests.two_factor import set_up_two_factor

SECRET = 'bypass-secret-for-tests'


@pytest.fixture(scope='session')
def django_db_modify_db_settings(django_db_modify_db_settings_parallel_suffix: None) -> None:
    """Gives each mutant's test run its own database."""
    # mutmut forks several pytest sessions at once; sharing test_tastebook, each drops and migrates it under the
    # others, and their errors count as killed mutants.
    if os.environ.get('MUTANT_UNDER_TEST'):
        database = django_settings.DATABASES['default']
        database.setdefault('TEST', {})['NAME'] = f'test_{database["NAME"]}_{os.getpid()}'


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
