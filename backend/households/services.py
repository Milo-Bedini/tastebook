import hmac
import logging
import math
import secrets
import smtplib
import time
from collections.abc import Mapping
from dataclasses import dataclass
from functools import partial
from importlib import import_module
from typing import Any

from allauth.account.adapter import get_adapter
from allauth.account.authentication import get_authentication_records
from allauth.account.models import EmailAddress
from allauth.core import ratelimit
from allauth.core.internal.ratelimit import Rate, get_cache_key, get_rates
from allauth.mfa.base.internal.flows import post_authentication
from allauth.mfa.models import Authenticator
from allauth.mfa.recovery_codes.internal.auth import RecoveryCodes
from allauth.mfa.totp.forms import ActivateTOTPForm
from allauth.mfa.totp.internal.flows import activate_totp
from django.conf import settings
from django.contrib.auth import SESSION_KEY, login, logout
from django.contrib.auth.base_user import AbstractBaseUser
from django.contrib.auth.models import AnonymousUser
from django.contrib.sessions.models import Session
from django.core.cache import cache
from django.core.mail import send_mail
from django.db import connection, transaction
from django.db.models.functions import Lower
from django.dispatch import Signal
from django.http import HttpRequest
from django.template.loader import render_to_string
from django.utils import timezone

from households.models import (
    INVITE_LIFETIME,
    NAME_MAX_LENGTH,
    Household,
    Invite,
    InviteStatus,
    StoredSignInCode,
    UnitSystem,
    User,
)
from households.signals import (
    account_deleting,
    counting_household_lists,
    counting_public_recipes_in,
    counting_recipes_to_copy,
    counting_recipes_to_delete,
    counting_recipes_to_keep,
    household_emptied,
    member_moved,
)

logger = logging.getLogger(__name__)


def is_test_account(email: str) -> bool:
    return email.rpartition('@')[2].lower() == settings.TEST_ACCOUNT_DOMAIN


def may_use_test_accounts(headers: Mapping[str, str]) -> bool:
    if not settings.TEST_ACCOUNTS_ENABLED:
        return False
    if not settings.TEST_ACCOUNT_CODES_NEED_SECRET:
        return True
    secret = headers.get('X-Test-Account-Secret', '')
    return bool(settings.TEST_ACCOUNT_SECRET) and hmac.compare_digest(secret, settings.TEST_ACCOUNT_SECRET)


def store_sign_in_code(email: str, code: str) -> None:
    StoredSignInCode.objects.update_or_create(email=email.lower(), defaults={'code': code})


def latest_sign_in_code(email: str) -> str | None:
    stored = StoredSignInCode.objects.filter(email=email.lower()).first()
    return stored.code if stored else None


def household_name_for(name: str) -> str:
    return f"{name}'s household"


@dataclass(frozen=True)
class TestMember:
    key: str
    name: str
    unit_system: UnitSystem


def add_test_household(name: str | None, members: list[TestMember]) -> list[User]:
    """A new household of new test accounts, one a member, in the members' order; named after the first member when
    no name is given. Each account has no usable password and a verified address at the test domain made of its key
    and eight random hex characters, so a seed never meets an account that exists."""
    household = Household.objects.create(name=name or household_name_for(members[0].name))
    accounts = [
        User.objects.create_user(
            f'{member.key}-{secrets.token_hex(4)}@{settings.TEST_ACCOUNT_DOMAIN}',
            name=member.name,
            household=household,
            unit_system=member.unit_system,
        )
        for member in members
    ]
    # Without a verified address, signing in by code later would stop to verify it.
    EmailAddress.objects.bulk_create(
        [EmailAddress(user=account, email=account.email, verified=True, primary=True) for account in accounts]
    )
    return accounts


def start_session(account: User) -> str:
    """Signs the account in on a new session, as signing in does, and returns the session's key."""
    request = HttpRequest()
    request.session = import_module(settings.SESSION_ENGINE).SessionStore()
    login(request, account, backend='django.contrib.auth.backends.ModelBackend')
    request.session.save()
    return request.session.session_key


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


def members_of(household_id: int, seen_by: User | None) -> list[Member]:
    """The household's members: whoever's looking first, if they're in it, then the others by name."""
    members = User.objects.filter(household_id=household_id).order_by(Lower('name'), 'pk')
    seen = [
        Member(id=member.pk, name=member.name, is_you=seen_by is not None and member.pk == seen_by.pk)
        for member in members
    ]
    return sorted(seen, key=lambda member: not member.is_you)


def rename_household(account: User, name: str) -> Household:
    """Renames the account's household and returns it."""
    household = Household.objects.get(pk=account.household_id)
    household.name = name
    household.save(update_fields=['name'])
    return household


def leave_household(account: User) -> User:
    """Moves the account into a new household of one, named after it, taking a copy of the private recipes it wrote;
    settles the household it left if that's now empty (settle_emptied_household). Returns the account as saved."""
    with transaction.atomic():
        # Every move locks the household before any account, so moves in one household run in turn and can't deadlock.
        household = Household.objects.select_for_update().filter(pk=account.household_id).first()
        account = User.objects.select_for_update().get(pk=account.pk)
        # Removed while this waited for the lock: already in a household of one, so there's nothing to leave.
        if household is None or account.household_id != household.pk:
            return account
        account.household = Household.objects.create(name=household_name_for(account.name))
        account.save(update_fields=['household'])
        member_moved.send(sender=User, account=account, left=household.pk)
        if not household.members.exists():
            settle_emptied_household(household.pk)
    return account


def remove_member(account: User, member_id: int) -> User:
    """Moves another member of the account's household into a new household of one, with a copy of the private recipes
    they wrote, and emails them once that's saved.
    Returns the account. Raises User.DoesNotExist when member_id isn't another member of the account's household."""
    with transaction.atomic():
        household = Household.objects.select_for_update().filter(pk=account.household_id).first()
        account = User.objects.get(pk=account.pk)
        # Removed while this waited for the lock, so they're no longer in a household to remove anyone from.
        if household is None or account.household_id != household.pk:
            raise User.DoesNotExist
        # One answer for yourself, another household's account and an unknown ID, so it never says who exists.
        member = User.objects.select_for_update().exclude(pk=account.pk).get(pk=member_id, household=household)
        # Otherwise they could come straight back through a link they kept.
        cancel_current_invite(household.pk)
        new_household = Household.objects.create(name=household_name_for(member.name))
        member.household = new_household
        member.save(update_fields=['household'])
        member_moved.send(sender=User, account=member, left=household.pk)
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


def current_invite(household_id: int) -> Invite | None:
    """The household's newest invite that nobody has cancelled, live or expired; None when there's none."""
    return Invite.objects.filter(household_id=household_id, cancelled_at__isnull=True).order_by('-pk').first()


def invite_status(invite: Invite) -> InviteStatus:
    if invite.cancelled_at is not None:
        return InviteStatus.CANCELLED
    return InviteStatus.LIVE if invite.expires_at > timezone.now() else InviteStatus.EXPIRED


def locked_household_of(account: User) -> Household:
    """Locks the account's household and returns it. Raises Household.DoesNotExist when the account was moved out of it
    (removed, or left in another tab) since the request began, so nothing is done to a household it has left."""
    household = Household.objects.select_for_update().get(pk=account.household_id)
    if not household.members.filter(pk=account.pk).exists():
        raise Household.DoesNotExist
    return household


def make_invite(account: User) -> Invite:
    """The household's live invite, made now if it has none (none at all, or only an expired one).
    Raises Household.DoesNotExist as locked_household_of does."""
    with transaction.atomic():
        # Under the lock, two members pressing at once get the same link rather than two live ones.
        household = locked_household_of(account)
        invite = current_invite(household.pk)
        if invite is not None and invite_status(invite) == InviteStatus.LIVE:
            return invite
        return Invite.objects.create(household=household, expires_at=timezone.now() + INVITE_LIFETIME)


def cancel_current_invite(household_id: int) -> None:
    # Callers hold the household's lock.
    invite = current_invite(household_id)
    if invite is not None:
        invite.cancelled_at = timezone.now()
        invite.save(update_fields=['cancelled_at'])


def cancel_invite(account: User) -> None:
    """Cancels the household's current invite, live or expired; does nothing when there's none.
    Raises Household.DoesNotExist as locked_household_of does."""
    with transaction.atomic():
        cancel_current_invite(locked_household_of(account).pk)


class InviteNotLiveError(Exception):
    """The invite was cancelled or expired before the join could happen."""


@dataclass(frozen=True)
class InvitedHousehold:
    name: str
    members: list[Member]


@dataclass(frozen=True)
class InviteSeen:
    status: InviteStatus
    is_member: bool
    household: InvitedHousehold | None
    recipes_to_copy: int
    lists_to_delete: int


def recipes_to_copy(account: User) -> int:
    """How many private recipes the account would take with it into another household."""
    return sum(count for _, count in counting_recipes_to_copy.send(sender=User, account=account))


def lists_to_delete(account: User) -> int:
    """How many lists moving out would delete with the household it leaves: its household's, when nobody else is in
    it (settle_emptied_household). Lists stay with a household others are still in."""
    if account.household_id is None or others_in_household(account) > 0:
        return 0
    return sum(count for _, count in counting_household_lists.send(sender=Household, household_id=account.household_id))


def invite_seen_by(token: str, viewer: User | None) -> InviteSeen:
    """What `viewer` (None when signed out) may see of the invite. Raises Invite.DoesNotExist for an unknown token."""
    invite = Invite.objects.select_related('household').get(token=token)
    status = invite_status(invite)
    is_member = viewer is not None and viewer.household_id == invite.household_id
    # A visitor, or someone holding a dead link, learns only its status: the members are personal data.
    shows_household = viewer is not None and (is_member or status == InviteStatus.LIVE)
    household = (
        InvitedHousehold(name=invite.household.name, members=members_of(invite.household_id, viewer))
        if shows_household
        else None
    )
    # Only someone the link offers a household to is told what joining would copy and delete.
    offered = viewer is not None and household is not None and not is_member
    return InviteSeen(
        status=status,
        is_member=is_member,
        household=household,
        recipes_to_copy=recipes_to_copy(viewer) if offered else 0,
        lists_to_delete=lists_to_delete(viewer) if offered else 0,
    )


def join_household(account: User, token: str) -> User:
    """Moves the account into the invite's household, taking a copy of the private recipes it wrote, and settles the
    household it left if that's now empty (settle_emptied_household).
    Returns the account as saved. Raises Invite.DoesNotExist for an unknown token, InviteNotLiveError for a dead one."""
    with transaction.atomic():
        invite = Invite.objects.get(token=token)
        # Every move locks households before accounts, and two households in pk order, so joins can't deadlock with
        # each other, with leaving and removing, or with make_invite and cancel_invite.
        list(
            Household.objects.select_for_update()
            .filter(pk__in={invite.household_id, account.household_id})
            .order_by('pk')
        )
        account = User.objects.select_for_update().get(pk=account.pk)
        # A cancel may have committed while this waited for the household's lock.
        invite.refresh_from_db()
        if invite_status(invite) != InviteStatus.LIVE:
            raise InviteNotLiveError
        if account.household_id == invite.household_id:
            return account
        # Removed while this waited: then it's in a new household of one that nobody else is in and that has no
        # invite, so it goes on from there without that household's lock.
        left = account.household_id
        account.household_id = invite.household_id
        account.save(update_fields=['household'])
        member_moved.send(sender=User, account=account, left=left)
        if left is not None and not User.objects.filter(household_id=left).exists():
            settle_emptied_household(left)
    return account


def name_from_google(profile: dict[str, Any]) -> str:
    """The first name on a Google profile, as an account's name; blank when it has none that fits."""
    name = str(profile.get('given_name') or '').strip()
    return name if len(name) <= NAME_MAX_LENGTH else ''


FORMER_HOUSEHOLD = 'A former household'
# The session key holding a deletion code: {'account': pk, 'code': str, 'sent_at': time.time(), 'attempts': int}.
DELETION_CODE = 'account_deletion_code'


def settle_emptied_household(household_id: int) -> None:
    """Empties a household its last member has just moved out of or deleted: deletes its private recipes and lists.
    Keeps it as FORMER_HOUSEHOLD, with no invite, while it holds public recipes (a former member's), so their links
    keep working; deletes it otherwise. Callers hold its lock."""
    household_emptied.send(sender=Household, household_id=household_id)
    if sum(count for _, count in counting_public_recipes_in.send(sender=Household, household_id=household_id)) == 0:
        Household.objects.filter(pk=household_id).delete()
        return
    Household.objects.filter(pk=household_id).update(name=FORMER_HOUSEHOLD)
    cancel_current_invite(household_id)


@dataclass(frozen=True)
class AccountDeletion:
    private_recipes: int
    public_recipes: int
    others_in_household: int
    is_staff: bool


class WrongDeletionCodeError(Exception):
    """The code isn't the one emailed, and it has tries left."""


class DeletionCodeStoppedError(Exception):
    """This session has no deletion code to try: none was asked, it was used, it's over 10 minutes old, it was asked
    for another account, or the last wrong try ended it."""


def others_in_household(account: User) -> int:
    if account.household_id is None:
        return 0
    return User.objects.filter(household_id=account.household_id).exclude(pk=account.pk).count()


def counted(signal: Signal, account: User, last: bool) -> int:
    """The sum of what a counting signal's receivers answer for the account; 0 for one with no household."""
    if account.household_id is None:
        return 0
    return sum(count for _, count in signal.send(sender=User, account=account, last=last))


def deletion_preview(account: User) -> AccountDeletion:
    """What deleting the account now would delete and keep of its household's recipes, and who'd stay in it."""
    others = others_in_household(account)
    last = account.household_id is not None and others == 0
    return AccountDeletion(
        private_recipes=counted(counting_recipes_to_delete, account, last),
        public_recipes=counted(counting_recipes_to_keep, account, last),
        others_in_household=others,
        is_staff=account.is_staff,
    )


def send_deletion_code(request: HttpRequest) -> bool:
    """Emails the signed-in account a new deletion code and keeps it in this session, replacing any earlier one.
    False when sign-in's code limit refuses, which deletion codes count towards; then nothing is sent."""
    account = request.user
    # Sign-in's own limit and key, so an address is sent no more codes of both kinds together than of either alone.
    if not ratelimit.consume(request, action='request_login_code', key=account.email.lower()):
        return False
    adapter = get_adapter(request)
    code = adapter.generate_login_code()
    request.session[DELETION_CODE] = {'account': account.pk, 'code': code, 'sent_at': time.time(), 'attempts': 0}
    adapter.send_mail('households/email/deletion_code', account.email, {'code': code})
    return True


def _spend_deletion_code(request: HttpRequest, code: str) -> None:
    """Spends this session's deletion code when `code` is it. Raises WrongDeletionCodeError or
    DeletionCodeStoppedError."""
    state = request.session.get(DELETION_CODE)
    if (
        state is None
        or state['account'] != request.user.pk
        or time.time() - state['sent_at'] > settings.ACCOUNT_LOGIN_BY_CODE_TIMEOUT
    ):
        request.session.pop(DELETION_CODE, None)
        raise DeletionCodeStoppedError
    if not hmac.compare_digest(code.encode(), state['code'].encode()):
        attempts = state['attempts'] + 1
        if attempts >= settings.ACCOUNT_LOGIN_BY_CODE_MAX_ATTEMPTS:
            request.session.pop(DELETION_CODE)
            raise DeletionCodeStoppedError
        request.session[DELETION_CODE] = {**state, 'attempts': attempts}
        raise WrongDeletionCodeError
    request.session.pop(DELETION_CODE)


def delete_account(request: HttpRequest, code: str) -> None:
    """Deletes the signed-in account once `code` is this session's deletion code: its name, address, sessions and
    personal lists, and the private recipes it wrote. Its public recipes stay. A household it was the last member of
    is settled as settle_emptied_household says.
    Signs this browser out. Raises WrongDeletionCodeError or DeletionCodeStoppedError, and then deletes nothing."""
    _spend_deletion_code(request, code)
    _delete_account(request.user)
    # Flushed, not left: with SESSION_SAVE_EVERY_REQUEST, saving a session whose row is gone fails the response.
    logout(request)


def _delete_account(user: User) -> None:
    with transaction.atomic():
        # Household first, then the account, as every move locks them.
        Household.objects.select_for_update().filter(pk=user.household_id).first()
        try:
            account = User.objects.select_for_update().get(pk=user.pk)
        except User.DoesNotExist:
            # A second press already deleted it.
            return
        # Removed while this waited: then it's alone in a new household that nobody can join, so it goes on with that.
        household_id = account.household_id
        last = household_id is not None and others_in_household(account) == 0
        if household_id is not None:
            account_deleting.send(sender=User, account=account)
        end_sessions_of(account)
        StoredSignInCode.objects.filter(email=account.email.lower()).delete()
        account.delete()
        if last:
            settle_emptied_household(household_id)


def end_sessions_of(account: User) -> None:
    """Deletes every session the account is signed in on, expired ones included."""
    # Database sessions don't record their account, so each is decoded; fine at Tastebook's size.
    signed_in = [
        session.session_key
        for session in Session.objects.iterator()
        if session.get_decoded().get(SESSION_KEY) == str(account.pk)
    ]
    Session.objects.filter(session_key__in=signed_in).delete()


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
