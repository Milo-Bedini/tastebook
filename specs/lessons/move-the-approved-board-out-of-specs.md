# Move an approved board into docs/design before building

- **Added:** 2026-10-29 · **Applies to:** implement | review · **Issue:** TAS-113
- **Paths:** `specs/*/design/**`, `docs/design/**`
- **Rule:** The design stage commits its boards to `specs/<ISSUE-ID>/design/`. In the first commit, move the boards the build uses into `docs/design/` (`dino/` or `picnic/`) with `git mv`, the HTML and PNG renamed to `<name>.dc.html` and `<name>.dc.png`, and name them in `docs/design.md`, so every board the stories and the design doc point at lives in one place. `boardByTitle` in `frontend/src/dino/boards.ts` takes only a `docs/design/` path.
- **Why:** On PR #93 (TAS-113) the approved board under `specs/TAS-113/design/` failed `pnpm lint`. Since TAS-166 Biome ignores boards under `specs/` as it does under `docs/design/`, so the move is now for keeping the boards together.
- **Re-check by:** 2027-01-29
