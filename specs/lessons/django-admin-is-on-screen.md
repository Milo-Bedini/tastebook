# The Django admin is on screen

- **Added:** 2026-10-27 · **Applies to:** implement | review · **Issue:** TAS-39, TAS-59
- **Paths:** `backend/*/admin.py`, `backend/*/templates/admin/**`
- **Rule:** A change to `backend/*/admin.py` (inlines, autocomplete fields, a select's choices, help text, permissions that hide Add, Save or Delete) or to a template under `backend/*/templates/admin/` changes a page staff use, so the PR's visual shows the admin changelist and change page that changed, signed in to `/admin/` as a superuser, like any other UI change. Don't leave an admin criterion unshown as if nothing changed on screen.
- **Why:** On TAS-39 (PR #39) the recipe admin gained group, line and step inlines, ingredient autocomplete and a group select limited to the recipe's groups, but the PR left "editing in the Django admin" unverified as nothing on screen, and review sent it back. On TAS-59 (PR #52) the catalogue admins became read-only with a notice from new admin templates, and the PR reached review with no screenshot of the admin, so nothing showed the notice or the missing controls.
