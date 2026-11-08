# End-to-end specs share one database that keeps what they leave

- **Added:** 2026-11-08 · **Applies to:** implement | review · **Issue:** TAS-127
- **Rule:** Every Playwright spec runs against one database, in parallel: the local one, or a PR's preview branch, which keeps its rows across pushes and runs. A recipe a spec leaves public is found by every later search, so give it a title no other spec uses or searches for, and never assert that a search by title finds one card or none: find a card by its title and description, and check a recipe is absent by its address.
- **Why:** On TAS-127, PR #164's publishing spec left Jo's copy of "Grandma's curry" public in the preview's database, and `e2e/recipe-new.spec.ts`, which searched "Grandma" for one card and then for none, failed on that preview from then on.
- **Re-check by:** 2027-02-08
