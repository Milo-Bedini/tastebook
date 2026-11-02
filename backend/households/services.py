import logging
import math
import smtplib
import time
from dataclasses import dataclass
from functools import partial
from typing import Any

from allauth.account.authentication import get_authentication_records
from allauth.core.internal.ratelimit import Rate, get_cache_key, get_rates
from allauth.mfa.base.internal.flows import post_authentication
from allauth.mfa.models import Authenticator
from allauth.mfa.recovery_codes.internal.auth import RecoveryCodes
from allauth.mfa.totp.forms import ActivateTOTPForm
from allauth.mfa.totp.internal.flows import activate_totp
from django.conf import settings
from django.contrib.auth.base_user import AbstractBaseUser
from django.contrib.auth.models import AnonymousUser
from django.core.cache import cache
from django.core.mail import send_mail
from django.db import connection, transaction
from django.db.models.functions import Lower
from django.http import HttpRequest
from django.template.loader import render_to_string
from django.utils import timezone

from households.models import NAME_MAX_LENGTH, Household, StoredSignInCode, UnitSystem, User

logger = logging.getLogger(__name__)


def is_test_account(email: str) -> bool:
    return email.rpartition('@')[2].lower() == settings.TEST_ACCOUNT_DOMAIN


def store_sign_in_code(email: str, code: str) -> None:
    StoredSignInCode.objects.update_or_create(email=email.lower(), defaults={'code': code})


def latest_sign_in_code(email: str) -> str | None:
    stored = StoredSignInCode.objects.filter(email=email.lower()).first()
    return stored.code if stored else None


def household_name_for(name: str) -> str:
    return f"{name}'s household"


def name_account(user: User, name: str) -> User:
    """Sets the account's name; an account with no household gets a new one, named after it."""
    with transaction.atomic():
        # Locking the row means two saves at once (a double press, two tabs) can't make two households.
        account = User.objects.select_for_update().get(pk=user.pk)
        account.name = name
        if account.household_id is None:
            account.household = Household.objects.create(name=household_name_for(name))
        account.save(update_fields=['name', 'household'])
    return account


def update_account(user: User, name: str | None = None, unit_system: UnitSystem | None = None) -> User:
    """Saves whichever of the name and unit system are given, together; naming follows name_account."""
    with transaction.atomic():
        account = name_account(user, name) if name is not None else User.objects.select_for_update().get(pk=user.pk)
        if unit_system is not None:
            account.unit_system = unit_system
            account.save(update_fields=['unit_system'])
    return account


@dataclass(frozen=True)
class Member:
    id: int
    name: str
    is_you: bool


def members_seen_by(account: User) -> list[Member]:
    """The account's household's members: the account first, then the others by name."""
    members = User.objects.filter(household_id=account.household_id).order_by(Lower('name'), 'pk')
    seen = [Member(id=member.pk, name=member.name, is_you=member.pk == account.pk) for member in members]
    return sorted(seen, key=lambda member: not member.is_you)


def rename_household(account: User, name: str) -> Household:
    """Renames the account's household and returns it."""
    household = Household.objects.get(pk=account.household_id)
    household.name = name
    household.save(update_fields=['name'])
    return household


def leave_household(account: User) -> User:
    """Moves the account into a new household of one, named after it; deletes the household it left if that's now empty.
    Returns the account as saved."""
    with transaction.atomic():
        # Every move locks the household before any account, so moves in one household run in turn and can't deadlock.
        household = Household.objects.select_for_update().filter(pk=account.household_id).first()
        account = User.objects.select_for_update().get(pk=account.pk)
        # Removed while this waited for the lock: already in a household of one, so there's nothing to leave.
        if household is None or account.household_id != household.pk:
            return account
        account.household = Household.objects.create(name=household_name_for(account.name))
        account.save(update_fields=['household'])
        if not household.members.exists():
            household.delete()
    return account


def remove_member(account: User, member_id: int) -> User:
    """Moves another member of the account's household into a new household of one and emails them once that's saved.
    Returns the account. Raises User.DoesNotExist when member_id isn't another member of the account's household."""
    with transaction.atomic():
        household = Household.objects.select_for_update().filter(pk=account.household_id).first()
        account = User.objects.get(pk=account.pk)
        # Removed while this waited for the lock, so they're no longer in a household to remove anyone from.
        if household is None or account.household_id != household.pk:
            raise User.DoesNotExist
        # One answer for yourself, another household's account and an unknown ID, so it never says who exists.
        member = User.objects.select_for_update().exclude(pk=account.pk).get(pk=member_id, household=household)
        new_household = Household.objects.create(name=household_name_for(member.name))
        member.household = new_household
        member.save(update_fields=['household'])
        transaction.on_commit(partial(tell_removed_member, member, account.name, household.name, new_household.name))
    return account


def tell_removed_member(member: User, removed_by: str, household_name: str, new_household_name: str) -> None:
    """Emails a removed member who removed them, from which household, and the name of their new one."""
    context = {
        'name': member.name,
        'removed_by': removed_by,
        'household': household_name,
        'new_household': new_household_name,
    }
    # As allauth does, so a household name can't break the header.
    subject = ' '.join(render_to_string('households/email/member_removed_subject.txt', context).splitlines()).strip()
    message = render_to_string('households/email/member_removed_message.txt', context)
    try:
        send_mail(subject, message, None, [member.email])
    except smtplib.SMTPException, OSError:
        # The exception carries the address, so it stays out of the log; the removal stands either way.
        logger.error("Couldn't send the removal email")


def name_from_google(profile: dict[str, Any]) -> str:
    """The first name on a Google profile, as an account's name; blank when it has none that fits."""
    name = str(profile.get('given_name') or '').strip()
    return name if len(name) <= NAME_MAX_LENGTH else ''


ALLAUTH_LIMITS = 'allauth.account'


def seconds_until_allowed(request: HttpRequest, action: str, key: str | None = None) -> int:
    """Whole seconds until every allauth limit on `action` would let `request` through again; at least 1."""
    now = time.time()
    waits = [
        wait_for(
            rate, cache.get(get_cache_key(request, app=ALLAUTH_LIMITS, action=action, rate=rate, key=key), []), now
        )
        for rate in get_rates(app=ALLAUTH_LIMITS, action=action)
    ]
    return max(1, math.ceil(max(waits, default=0)))


def wait_for(rate: Rate, history: list[float], now: float) -> float:
    # allauth keeps the newest hit first; a slot frees when the rate.amount-th newest one leaves the window.
    live = [hit for hit in history if hit > now - rate.duration]
    return live[rate.amount - 1] + rate.duration - now if len(live) >= rate.amount else 0


def clear_expired_sign_in_limits() -> int:
    """Deletes the cache rows whose time has passed, and says how many; the cache holds only sign-in's limits."""
    # Django deletes expired rows only once the table passes MAX_ENTRIES, and these rows hold client IP addresses.
    table = connection.ops.quote_name(settings.CACHES['default']['LOCATION'])
    with connection.cursor() as cursor:
        cursor.execute(f'DELETE FROM {table} WHERE expires < %s', [timezone.now()])
        return cursor.rowcount


def is_staff_account(user: AbstractBaseUser | AnonymousUser) -> bool:
    return bool(user.is_authenticated and user.is_active and user.is_staff)


def has_authenticator(user: AbstractBaseUser) -> bool:
    return Authenticator.objects.filter(user_id=user.pk, type=Authenticator.Type.TOTP).exists()


def passed_two_factors(request: HttpRequest) -> bool:
    """Whether this session's sign-in included an authenticator or recovery code that the account still has."""
    used = [
        record.get('id')
        for record in get_authentication_records(request, request.user)
        if record.get('method') == 'mfa'
    ]
    # Only factors that still exist count: after reset_two_factor, a new authenticator mustn't vouch for this session.
    return Authenticator.objects.filter(user_id=request.user.pk, pk__in=used).exists()


def may_open_admin(request: HttpRequest) -> bool:
    return is_staff_account(request.user) and passed_two_factors(request)


def turn_on_two_factor(request: HttpRequest, form: ActivateTOTPForm) -> list[str]:
    """Saves the authenticator and recovery codes; counts as this session's second factor. Returns the codes."""
    totp, recovery = activate_totp(request, form)
    # The code that confirmed the app proves the second factor, so the admin opens without asking again.
    post_authentication(request, totp)
    # Never None here: setup runs only without an authenticator, and removing one removes its recovery codes.
    return RecoveryCodes(recovery).get_unused_codes()


def account_with_email(email: str) -> User:
    return User.objects.get(email__iexact=email)


def make_staff(email: str) -> User:
    """Makes the account with this address staff and superuser; raises User.DoesNotExist when there's none."""
    account = account_with_email(email)
    account.is_staff = True
    account.is_superuser = True
    account.save(update_fields=['is_staff', 'is_superuser'])
    return account


def reset_two_factor(email: str) -> int:
    """Deletes the account's authenticator and recovery codes and says how many; raises User.DoesNotExist."""
    deleted, _ = Authenticator.objects.filter(user=account_with_email(email)).delete()
    return deleted
