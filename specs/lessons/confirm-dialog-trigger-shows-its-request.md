# A ConfirmDialog trigger shows its request while it runs

- **Added:** 2026-11-02 · **Applies to:** spec | implement | review · **Issue:** TAS-147
- **Paths:** `frontend/src/**/*-page.tsx`
- **Rule:** When a ConfirmDialog's confirm sends a request, its trigger Button carries `loading={mutation.isPending}` and an "-ing" `loadingLabel` ("Removing…", "Leaving…", "Cancelling…"), and a page test holds the request and asserts the trigger's loading name. A spec that names a dialog's confirm should name the trigger's loading label too.
- **Why:** On PR #115 the invite link's "Cancel link" trigger looked idle until the `DELETE` settled and could reopen the dialog, unlike Remove and Leave beside it; the spec named "Making…" for the make button but no loading label for cancelling, and review caught it.
