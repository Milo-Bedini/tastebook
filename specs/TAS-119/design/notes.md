# TAS-119: Make your recipe public, and private again — design

Canvas: https://claude.ai/artifact/1uRdu5ifcDghtpxRFF327z

## Boards

- `Main.dc.html` — The switch with the author's controls: the author's recipe page at phone width, the Public switch off, disabled ("Add what's missing before making it public.", under the What's missing banner) and on ("by Sam" in place of the private mark), above Edit recipe and Delete recipe.
- `publishing.dc.html` — Publishing, and private again: turn on → confirm dialog (focus on Cancel) → "Making public…" pending in the confirm → public with toast; turn off → switch disabled "Saving…" → private again with toast.
- `answers.dc.html` — When the request doesn't go through: 400 refused (the API's words in an error toast, page refetches), 404 gone (info toast, not-found or no switch, focus to heading), network or 403 still signed in (nothing changed, switch as it was); 403 signed out goes to sign-in with `next`.
- `others-view.dc.html` — Everyone else: "by Sam" on the page and the card: a household member who isn't the author (no switch, no Edit), signed out, and the list card for another household ("by Sam" as the meta's first line).
- `laptop.dc.html` — The author's page at 1280 px: credit, switch and buttons in the intro's right-hand column; the switch row stops at 400 px.
- `confirm-dialog.dc.html` — ConfirmDialog: the default (danger, trigger) unchanged, `tone="primary"`, controlled pending, 320 px wrap and forced colours, with the props change.
- `rule-change.dc.html` — Proposed rule change to `docs/design.md`.

## Decisions

- The Public switch goes at the end of the intro, with Edit recipe and Delete recipe, so everything only the author can do is together. Only the author sees it (`can_publish`).
- Turning it on asks first with a ConfirmDialog whose confirm is primary and names the action ("Make public"); focus starts on Cancel. Turning it off acts at once, with no dialog; turning it on again is the undo.
- The switch moves only once the request answers; while saving it's disabled with the reason "Saving…". Focus returns to the switch, or to the page's heading when the switch has gone.
- Each answer is reported in a toast ("Grandma's curry is public", "… is private again", the API's words on a 400, an info toast on a 404, a connection error otherwise). No Undo on the toast.
- A public recipe shows "by <name>" (Muted Body) where a private one shows its mark: one or the other, never both. It's plain text, not a link. On the card it's the meta block's first line, in Small Muted.
- When the recipe can't be published yet, the switch is disabled, with its reason under it; the What's missing banner above it lists the gaps. An ingredient awaiting review alone doesn't disable it.
- No layout changes at tablet or laptop beyond the switch row's 400 px cap.

## Proposed rule change (docs/design.md)

- **Components › Dialog:** a change that can be undone but reaches beyond the household (making a recipe public) may ask first, with a primary button that names it; undoing it acts at once, without asking. Why: an Undo toast would come after the name was already out.
- **Components › Private mark:** a household's public recipe shows "by <name>" in its place, as plain text in the surrounding text style, never a mark.
- **Components › Switch:** while the change it makes is saving, it's disabled with the reason "Saving…", and moves only once the change is saved.

## Components

- **ConfirmDialog** (changed): optional `tone: 'danger' | 'primary'` (default `danger`) and a controlled form (`open` + `onOpenChange` in place of `trigger`), in which the confirm shows the pending state and stays open until the caller closes it. Existing dialogs are unchanged. Stories: `PrimaryTone` and `Controlled` (pending).
