# MSW can't read a jsdom File from a multipart body

- **Added:** 2026-11-07 · **Applies to:** spec | implement | review · **Issue:** TAS-118
- **Paths:** `frontend/src/**/*.test.tsx`
- **Rule:** In the jsdom tests, a handler that calls `await request.formData()` on an upload throws inside undici (`webidl.is.File` fails on jsdom's `File`), MSW answers it as a network error, and the page shows its connection message. Read the body with `await request.text()` and match `name="<field>"; filename="…"` instead. To click a Sonner toast's action button, focus it and press Enter: a pointer on a toast calls `setPointerCapture`, which jsdom lacks, and Vitest fails the run on the uncaught error. The documented-answers check (`frontend/vitest.documented-answers.ts`) finds an upload sent with `XMLHttpRequest` (for its progress) only when it opens with a literal method and `` `${apiBaseUrl}<path>` ``, as `sendPhoto` does (TAS-182).
- **Why:** On TAS-118 every photo upload test failed with "Couldn't upload the photo" until the handler read the body as text, and the Undo test failed the whole run on the pointer capture.
- **Re-check by:** 2027-02-07
