# A control on every recipe card shares its hooks through one provider

- **Added:** 2026-11-07 · **Applies to:** spec, implement, review · **Issue:** TAS-123
- **Rule:** `/recipes` renders up to 24 cards a page (the whole catalogue at once until TAS-228), and every card's hooks add up, so a control added to every card must not call queries, mutations or router hooks of its own. Set them up once round the grid (as `Hearts` in `frontend/src/collections/favourite-toggle.tsx` does) and let each card read a context; track per-card state, such as which one is busy, by its recipe (`useMutationState` with a `mutationKey`), not with each card's own `isPending`. Check `/recipes` with Lighthouse's performance score before pushing.
- **Why:** on PR #157 each heart set up the session, Favourites, three mutations and the address itself, over 2,000 hooks on one page. Total blocking time went from about 290 ms to over 1,000 ms and `/recipes` fell below Lighthouse's 0.8 performance minimum on the preview.
- **Re-check by:** 2027-02-07
