# mutmut runs the backend tests from a copy

- **Added:** 2026-11-08 · **Applies to:** implement | review · **Issue:** TAS-169
- **Rule:** A backend test that reads a file outside `backend/` finds it by walking up from `__file__` to the folder that holds it, never by a fixed `parents[n]`. `pnpm mutation:backend` runs the tests from `backend/mutants/`, a folder deeper, where only `backend/`'s packages are copied; a test that fails there stops the whole mutation run before any mutant.
- **Why:** `test_the_catalogue_stays_more_than_10_percent_under_biomes_size_limit` read `parents[2] / 'biome.json'`, which under mutmut is `backend/biome.json`, so every backend mutation run failed with `failed to collect stats` until TAS-169.
- **Re-check by:** 2027-02-08
