# A new route under /api/lists/ must not take a personal list's address

- **Added:** 2026-11-08 · **Applies to:** triage | spec | implement | review · **Issue:** TAS-125
- **Paths:** `backend/recipe_collections/urls.py`
- **Rule:** A personal list lives at `/api/lists/<slug>/` and its slug is made from any name but Favourites, so a new one-part route (`saved/`) takes the address of a list called "Saved", and a new `<slug>/<word>/` route meets `household/<slug>/` for a list called "Household". Give a new route two parts with a fixed first part that `household/<slug>/` doesn't use (`recipes/<slug>/`, `saved/<id>/`), or put the list in the body, and check it against both `<slug>/` and `household/<slug>/`.
- **Why:** TAS-125's triage proposed `POST /api/lists/<slug>/saved/` to save to a personal list; with Django taking the first match, either a list called "Household" couldn't be saved to or a household list called "Saved" couldn't be read. The build used `/api/lists/recipes/<slug>/` with the list's scope and slug in the body.
- **Re-check by:** 2027-02-08
