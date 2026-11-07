# A service's refusal without a field needs NON_FIELD_ERRORS as its key

- **Added:** 2026-11-07 · **Applies to:** spec | implement · **Issue:** TAS-119
- **Paths:** `backend/**/services.py`, `backend/**/views.py`
- **Rule:** The views turn a Django `ValidationError` from a service into the API's `400` through `error.message_dict`, which only a dict-keyed error has. A refusal that names no field is raised as `ValidationError({NON_FIELD_ERRORS: [message]})` (from `django.core.exceptions`), and reaches the client as `non_field_errors`; a plain `ValidationError('…')` makes the view answer `500`.
- **Why:** The TAS-119 spec had `edit_recipe` raise `ValidationError('A public recipe needs …')` and said the view's existing mapping would send it as `non_field_errors`; the test got `AttributeError: 'ValidationError' object has no attribute 'error_dict'`.
- **Re-check by:** 2027-02-07
