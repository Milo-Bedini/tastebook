"""Vercel's build step for the API: brings this deployment's database and catalogue up to date before it goes live."""

import os

import django
from django.core.management import call_command
from django.db import connection, transaction
from django.db.backends.utils import CursorWrapper
from django.db.migrations.recorder import MigrationRecorder

PREVIEW_NOT_BORN_EMPTY = (
    "This preview's database wasn't empty at its first build, so it was copied from another branch, "
    "most likely production's. Either Neon's default branch isn't previews-base, or this preview's branch "
    'was made before it was. Check the default branch in Neon, then delete preview/<git branch> there and '
    'redeploy: see docs/architecture.md, Environments.'
)
BORN_EMPTY = 'Tastebook preview database, born empty'
SWITCH_REFUSED = (
    "The admin's log or the old auth_user table holds rows, so the switch to households.User can't drop them. "
    'Keep what they hold elsewhere, empty them, and deploy again: see specs/TAS-102.md.'
)


def is_empty() -> bool:
    return 'django_migrations' not in connection.introspection.table_names()


def mark_born_empty() -> None:
    # A Neon branch copies the schema's comment, and production's never has this one, so the mark can't arrive from it.
    with connection.cursor() as cursor:
        cursor.execute(f"COMMENT ON SCHEMA public IS '{BORN_EMPTY}'")


def was_born_empty() -> bool:
    with connection.cursor() as cursor:
        cursor.execute("SELECT obj_description('public'::regnamespace, 'pg_namespace')")
        return cursor.fetchone()[0] == BORN_EMPTY


def refuse_a_preview_not_born_empty() -> None:
    # Whatever a copy holds today, it came from a branch that isn't previews-base, so the setup is wrong.
    if not was_born_empty():
        raise SystemExit(PREVIEW_NOT_BORN_EMPTY)


def holds_rows(cursor: CursorWrapper, table: str) -> bool:
    cursor.execute(f'SELECT EXISTS (SELECT 1 FROM {table})')
    return cursor.fetchone()[0]


def switch_to_the_custom_user() -> None:
    # admin.0001 ran before AUTH_USER_MODEL named households.User, so migrate would stop with
    # InconsistentMigrationHistory. The admin has never been reachable on Vercel, so its log is empty.
    if is_empty():
        return
    applied = MigrationRecorder(connection).applied_migrations()
    if ('admin', '0001_initial') not in applied or ('households', '0001_initial') in applied:
        return
    tables = connection.introspection.table_names()
    with transaction.atomic(), connection.cursor() as cursor:
        if holds_rows(cursor, 'django_admin_log') or ('auth_user' in tables and holds_rows(cursor, 'auth_user')):
            raise SystemExit(SWITCH_REFUSED)
        cursor.execute('DROP TABLE IF EXISTS django_admin_log, auth_user_groups, auth_user_user_permissions, auth_user')
        cursor.execute("DELETE FROM django_migrations WHERE app = 'admin'")


def main() -> None:
    # Migrations take Neon's direct connection; the pooled one is for requests.
    unpooled = os.environ.get('DATABASE_URL_UNPOOLED')
    if unpooled:
        os.environ['DATABASE_URL'] = unpooled
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
    django.setup()
    is_preview = os.environ.get('VERCEL_ENV') == 'preview'
    # Marked before migrating, so a build that fails part-way still leaves the mark for the next push's build.
    if is_preview:
        if is_empty():
            mark_born_empty()
        refuse_a_preview_not_born_empty()
    switch_to_the_custom_user()
    call_command('migrate', interactive=False)
    # A catalogue file the database can't hold fails the build, so the deployment never goes live without it.
    call_command('load_catalogue')


if __name__ == '__main__':
    main()
