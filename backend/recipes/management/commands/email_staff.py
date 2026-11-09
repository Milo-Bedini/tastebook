import smtplib
from typing import Any

from django.core.management.base import BaseCommand, CommandError

from recipes.services import email_staff_what_waits


class Command(BaseCommand):
    help = (
        'Emails staff what reports and recipes are waiting for them, when something new is. Runs every hour from '
        '.github/workflows/staff-email.yml.'
    )

    def handle(self, *args: Any, **options: Any) -> None:
        try:
            emailed = email_staff_what_waits()
        except smtplib.SMTPException, OSError:
            # Without its cause, which carries the addresses; failing shows the run red in Actions.
            raise CommandError("Couldn't send the staff email; the next run tries again.") from None
        self.stdout.write(f'Emailed {emailed} staff accounts.')
