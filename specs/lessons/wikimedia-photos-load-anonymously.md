# Wikimedia Commons photos load without credentials

- **Added:** 2026-10-28 · **Applies to:** spec | implement | review · **Issue:** TAS-48
- **Paths:** `frontend/src/dino/recipe-photo.tsx`, `backend/recipes/catalogue.json`
- **Rule:** `pnpm lint` (`tools/biome/anonymous-images.grit`) asks for `crossOrigin` on an `<img>`. It's needed because `upload.wikimedia.org` sets a `WMF-Uniq` cookie (`SameSite=None`) on every image response: a photo loaded with credentials stores it as a third-party cookie, and Lighthouse's `third-party-cookies` and `inspector-issues` audits drop Best Practices on the page to 79. Commons answers `Access-Control-Allow-Origin: *`, so an anonymous photo still loads. A PR that adds photos to the catalogue isn't done until its own preview checks comment has passed (see `vercel-preview-checks.md`).
- **Why:** PR #54 was the first to give catalogue recipes photos, and its preview's Best Practices on `/recipes` fell to 79; the photo component had been built and tested against recipes without photos, so the cookie never showed.
- **Re-check by:** 2027-01-28
