# Handle every answer an endpoint documents

- **Added:** 2026-11-02 · **Applies to:** spec | implement | review · **Issue:** TAS-147
- **Paths:** `frontend/src/**/*-api.ts`, `frontend/src/**/*-page.test.tsx`
- **Rule:** A mutation hook handles every status its endpoint documents in `backend/schema.yml`, not only `200`: a `404` meaning the caller's household changed under the page invalidates `HOUSEHOLD_KEY` (as `useRemoveMember` does) instead of throwing into the "Check your connection" toast. Each documented non-`200` answer of a mutation gets a page test with MSW. A spec's API section that lists `| 404` should say what the page does with it.
- **Why:** On PR #115 the invite link's make and cancel threw on the backend's `404` (the caller moved out of the household meanwhile), so the toast blamed the connection, the page kept the old household and every retry got `404` again. The spec listed the `404` but not what the page did with it.
