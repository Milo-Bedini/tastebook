# A ConfirmDialog trigger shows its request while it runs

- **Added:** 2026-11-02 · **Applies to:** spec | implement | review · **Issue:** TAS-147
- **Paths:** `frontend/src/dino/confirm-dialog.tsx`, `frontend/src/**/*-page.tsx`
- **Rule:** `ConfirmDialog` requires `pending` and an "-ing" `pendingLabel` ("Removing…") and puts them on its trigger, so the type enforces this (TAS-164). A spec that names a dialog's confirm names its pending label too, and a page test holds the request and asserts the trigger's loading name.
- **Why:** On PR #115 the invite link's "Cancel link" trigger looked idle until the `DELETE` settled and could reopen the dialog, unlike Remove and Leave beside it; the spec named "Making…" for the make button but no loading label for cancelling, and review caught it.
