# A busy heart ignores presses, and Playwright still clicks it

- **Added:** 2026-11-07 · **Applies to:** implement · **Issue:** TAS-123
- **Rule:** in an e2e spec or verify walk, wait for a `FavouriteButton` (or any control that marks itself `aria-busy` while it loads) to drop `aria-busy` before clicking it: `await expect(heart).not.toHaveAttribute('aria-busy')`. Playwright's click waits for a control to be enabled, not for it to stop being busy, so it presses a heart that's still waiting on Favourites and the press is dropped.
- **Why:** on PR #157 the Favourites spec passed against the local servers and failed twice on the preview, where Favourites loads after the page: the heart showed `aria-pressed="false"` while busy, the click went nowhere and "Saved to Favourites" never appeared.
- **Re-check by:** 2027-02-07
