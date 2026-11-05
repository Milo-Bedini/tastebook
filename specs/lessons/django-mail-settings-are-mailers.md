# Django 6.1 configures email through MAILERS

- **Added:** 2026-10-30 · **Applies to:** spec | implement | review · **Issue:** TAS-102
- **Paths:** `backend/config/settings.py`
- **Rule:** Configure email as `MAILERS = {'default': {'BACKEND': …, 'OPTIONS': {'host': …, 'port': …, 'use_ssl': …, 'username': …, 'password': …, 'timeout': …}}}`, not the old `EMAIL_*` settings, which Django refuses alongside `MAILERS`. `DEFAULT_FROM_EMAIL` isn't deprecated, and pytest-django still swaps every mailer for the in-memory one. A deprecated Django setting or call now fails `uv run pytest` with Django's warning (`filterwarnings` in `backend/pyproject.toml`), so the tests catch it.
- **Why:** The TAS-102 spec sketched the deprecated settings; the first test run on PR #99 only warned, and the build moved to `MAILERS`. TAS-161 made the warning fail the tests.
- **Re-check by:** 2027-01-30
