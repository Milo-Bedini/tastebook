# The recipe list shows 24 recipes a page

- **Added:** 2026-11-10 · **Applies to:** spec | implement | review · **Issue:** TAS-228
- **Paths:** `frontend/e2e/**`, `backend/tests/**`
- **Rule:** `GET /api/recipes/` answers one page, `{count, next, previous, results}` with 24 recipes in `results`, and `/recipes` shows that page. A Playwright check that a recipe is listed, or isn't, searches for it first (`/recipes?q=grandma`), so the filters decide it and not which page it falls on; an unsearched catalogue of about 300 puts most recipes past page 1. A backend test reads `response.json()['results']`, and one that needs the whole catalogue follows `next` (`every_summary` in `backend/tests/test_catalogue.py`). A spec that sketches the list's response or a check on `/recipes` should say which page it means.
- **Why:** On TAS-228, paging failed three e2e checks written against the whole list ("Greek salad", "Spanish tortilla" and a newly public "Grandma's curry" were past page 1) and about 200 backend tests that read the list as an array; triage had found the backend ones but not the e2e ones.
- **Re-check by:** 2027-02-10
