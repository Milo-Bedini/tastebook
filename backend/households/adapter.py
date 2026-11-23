from typing import Any

from allauth.account.adapter import DefaultAccountAdapter
from allauth.account.internal.flows.reauthentication import get_reauthentication_flows
from allauth.core import context
from allauth.socialaccount.adapter import DefaultSocialAccountAdapter
from allauth.socialaccount.models import SocialLogin
from django.conf import settings
from django.core.exceptions import ValidationError
from django.http import HttpRequest

from households.models import User
from households.services import is_test_account, name_account, name_from_google, store_sign_in_code

TEST_ADDRESS_REFUSED = 'Addresses at tastebook.test are only for testing. Use your own email address.'


class AccountAdapter(DefaultAccountAdapter):
    def clean_email(self, email: str) -> str:
        email = super().clean_email(email)
        if is_test_account(email) and not settings.TEST_ACCOUNTS_ENABLED:
            raise ValidationError(TEST_ADDRESS_REFUSED, code='test_account')
        return email

    def send_mail(self, template_prefix: str, email: str, context: dict[str, Any]) -> None:
        # A test account's code is stored for the end-to-end tests to read, never emailed.
        if settings.TEST_ACCOUNTS_ENABLED and is_test_account(email) and 'code' in context:
            store_sign_in_code(email, context['code'])
            return
        super().send_mail(template_prefix, email, context)

    def is_reauthentication_required(self, *, app: str, **kwargs: Any) -> bool:
        # An account with no way to reauthenticate (no password, no authenticator yet), such as staff setting up their
        # first authenticator, isn't asked to, as allauth did before 65.22.
        required = super().is_reauthentication_required(app=app, **kwargs)
        return required and bool(get_reauthentication_flows(context.request.user))


# What sign-in uses of a Google profile; the rest (photo, full name, locale) isn't stored.
KEPT_GOOGLE_PROFILE = ('email', 'email_verified', 'given_name')


class SocialAccountAdapter(DefaultSocialAccountAdapter):
    def populate_user(self, request: HttpRequest, sociallogin: SocialLogin, data: dict[str, Any]) -> User:
        user = super().populate_user(request, sociallogin, data)
        profile = sociallogin.account.extra_data
        sociallogin.account.extra_data = {key: profile[key] for key in KEPT_GOOGLE_PROFILE if key in profile}
        return user

    def pre_social_login(self, request: HttpRequest, sociallogin: SocialLogin) -> None:
        # An address Google hasn't checked could be anyone's, so it neither signs in to an account nor makes one.
        if not any(address.verified for address in sociallogin.email_addresses):
            raise ValidationError('Google has not verified this email address.', code='unverified_email')

    def save_user(self, request: HttpRequest, sociallogin: SocialLogin, form: Any = None) -> User:
        user = super().save_user(request, sociallogin, form)
        name = name_from_google(sociallogin.account.extra_data)
        if name:
            name_account(user, name)
            user.refresh_from_db(fields=['name', 'household'])
        return user
