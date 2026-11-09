from datetime import UTC, datetime

import pytest
from django.core.mail import EmailMessage
from django.core.management import CommandError, call_command
from django.test import Client
from pytest_django.fixtures import Settings

from tests.conftest import Clock
from tests.test_accounts import BrowserClient
from tests.test_household import signed_up
from tests.test_publishing_recipes import publish
from tests.test_reviewing_reports import reported_curry, review
from tests.test_staff import account, staff
from tests.test_waiting_for_review import complete

SAM = 'sam@example.com'


def held_by_philippa(*titles: str) -> BrowserClient:
    """Philippa's recipes with the titles, made public today after 3 others, so each waits for review."""
    philippa = signed_up('philippa@example.com', 'Philippa')
    asks_to_publish(philippa, 'Toast', 'Eggs', 'Beans', *titles)
    return philippa


def asks_to_publish(author: BrowserClient, *titles: str) -> None:
    for title in titles:
        publish(author, complete(author, title))


def run_at(clock: Clock, when: datetime, mailoutbox: list[EmailMessage]) -> list[tuple[list[str], str, str]]:
    """Runs the hourly command at the time, returning who it emailed, the subject and the body."""
    clock.now = when
    mailoutbox.clear()
    call_command('email_staff')
    return [(email.to, email.subject, email.body) for email in mailoutbox]


@pytest.mark.django_db
def test_staff_are_emailed_everything_waiting(clock: Clock, mailoutbox: list[EmailMessage]) -> None:
    clock.now = datetime(2026, 11, 9, 14, 5, tzinfo=UTC)
    staff(SAM)
    account('former@example.com', is_staff=True, is_active=False)
    reported_curry()
    held_by_philippa('Pie')

    sent = run_at(clock, datetime(2026, 11, 9, 14, 23, tzinfo=UTC), mailoutbox)

    assert sent == [
        (
            [SAM],
            'Waiting for staff on Tastebook: 1 reported recipe, 1 waiting for review',
            'Hi,\n\n'
            'Something new is waiting for staff on Tastebook. This lists everything waiting now.\n\n'
            'Reported recipes, with their reports awaiting review:\n'
            "- Grandma's curry: 1 report\n\n"
            'Restore or remove them at http://localhost:5173/admin/recipes/reportedrecipe/\n\n'
            'Recipes waiting for review, asked for first at the top:\n'
            '- Pie: asked to publish 9 Nov, 14:05\n\n'
            'Approve them at http://localhost:5173/admin/recipes/heldrecipe/\n\n'
            "You'll get at most one of these an hour, and only when something new is waiting.\n\n",
        )
    ]


@pytest.mark.django_db
def test_each_staff_account_gets_its_own_email(clock: Clock, mailoutbox: list[EmailMessage]) -> None:
    clock.now = datetime(2026, 11, 9, 14, 5, tzinfo=UTC)
    staff(SAM)
    staff('ana@example.com')
    held_by_philippa('Pie')

    sent = run_at(clock, datetime(2026, 11, 9, 14, 23, tzinfo=UTC), mailoutbox)

    assert sorted(to for to, _, _ in sent) == [['ana@example.com'], [SAM]]


@pytest.mark.django_db
def test_nothing_is_sent_when_only_reviewed_reports_wait(
    clock: Clock, admin_client: Client, mailoutbox: list[EmailMessage]
) -> None:
    clock.now = datetime(2026, 11, 9, 14, 5, tzinfo=UTC)
    review(admin_client, 'restore', reported_curry())

    nothing_waiting = run_at(clock, datetime(2026, 11, 9, 14, 23, tzinfo=UTC), mailoutbox)
    held_by_philippa('Pie')
    one_waiting = run_at(clock, datetime(2026, 11, 9, 15, 23, tzinfo=UTC), mailoutbox)

    assert (nothing_waiting, [to for to, _, _ in one_waiting]) == ([], [['admin@example.com']])


@pytest.mark.django_db
def test_staff_are_emailed_again_only_when_something_new_waits_and_at_most_once_an_hour(
    clock: Clock, mailoutbox: list[EmailMessage]
) -> None:
    clock.now = datetime(2026, 11, 9, 14, 5, tzinfo=UTC)
    staff(SAM)
    reported_curry()

    first = run_at(clock, datetime(2026, 11, 9, 14, 23, tzinfo=UTC), mailoutbox)
    nothing_new = run_at(clock, datetime(2026, 11, 9, 15, 23, tzinfo=UTC), mailoutbox)
    clock.now = datetime(2026, 11, 9, 15, 30, tzinfo=UTC)
    philippa = held_by_philippa('Pie')
    something_new = run_at(clock, datetime(2026, 11, 9, 15, 50, tzinfo=UTC), mailoutbox)
    clock.now = datetime(2026, 11, 9, 15, 52, tzinfo=UTC)
    asks_to_publish(philippa, 'Tart')
    same_hour = run_at(clock, datetime(2026, 11, 9, 15, 58, tzinfo=UTC), mailoutbox)
    next_hour = run_at(clock, datetime(2026, 11, 9, 16, 23, tzinfo=UTC), mailoutbox)
    after = run_at(clock, datetime(2026, 11, 9, 17, 23, tzinfo=UTC), mailoutbox)

    assert [len(sent) for sent in (first, nothing_new, something_new, same_hour, next_hour, after)] == [
        1,
        0,
        1,
        0,
        1,
        0,
    ]
    [(_, subject, body)] = next_hour
    assert subject == 'Waiting for staff on Tastebook: 1 reported recipe, 2 waiting for review'
    assert '- Pie: asked to publish 9 Nov, 15:30\n- Tart: asked to publish 9 Nov, 15:52\n' in body


@pytest.mark.django_db
def test_an_email_that_can_t_be_sent_fails_the_run_and_the_next_run_sends_it(
    clock: Clock, settings: Settings, mailoutbox: list[EmailMessage]
) -> None:
    clock.now = datetime(2026, 11, 9, 14, 5, tzinfo=UTC)
    staff(SAM)
    reported_curry()
    in_memory = settings.MAILERS
    # Nothing listens on port 9, so the send fails as an unreachable mail server would.
    settings.MAILERS = {
        'default': {
            'BACKEND': 'django.core.mail.backends.smtp.EmailBackend',
            'OPTIONS': {'host': '127.0.0.1', 'port': 9, 'timeout': 1},
        }
    }

    with pytest.raises(CommandError) as failed:
        run_at(clock, datetime(2026, 11, 9, 14, 23, tzinfo=UTC), mailoutbox)
    settings.MAILERS = in_memory
    retried = run_at(clock, datetime(2026, 11, 9, 14, 30, tzinfo=UTC), mailoutbox)

    assert str(failed.value) == "Couldn't send the staff email; the next run tries again."
    assert SAM not in str(failed.value)
    assert [to for to, _, _ in retried] == [[SAM]]
