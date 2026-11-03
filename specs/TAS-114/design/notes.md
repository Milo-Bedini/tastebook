# TAS-114: Add a private recipe, design hand-off

Canvas: https://claude.ai/artifact/CvpfZUdCyMcDjEfbpZ75p2 (approved at Design Review)

## Boards

- `Main.dc.html`: Add a recipe, phone (390 px). The form as it opens, filled in, with the chip groups still loading, and with the cuisines failing to load.
- `form-states.dc.html`: Checking, saving and waiting, phone. Save with no title, bad times and extra time with no reason, Makes with nothing it makes, Saving…, a 400 with no field (danger Banner), a network failure (toast), checking you're signed in, and that check failing.
- `form-laptop.dc.html`: Add a recipe, laptop (1280 px). The same 640 px column; only prep, cook and extra time share a row.
- `recipe-list.dc.html`: The list. "Add a recipe" under the title (signed in and signed out, phone and laptop), and the private mark on private recipes' cards.
- `private-recipe.dc.html`: A private recipe, phone. Only a title; a prep time only (one blob); every detail the form takes. The private mark under the title, then a warning Banner listing what's missing.
- `private-recipe-laptop.dc.html`: A private recipe, laptop. Two columns, 5 to 7; the mark and the Banner sit in the intro column.
- `private-mark.dc.html`: Private mark (new Dino component): at size, anatomy, beside a sticker and a chip, on a card, on the recipe page, at 200% text and under forced colours.
- `time-blobs.dc.html`: TimeBlobs (changed): one to three blobs, at phone and laptop widths, 200% text and forced colours.
- `proposed-rule-change.dc.html`: Proposed edits to `docs/design.md`.

## Decisions

- The form is one column at every width (640 px at most), in the spec's order, with three section headings: "Times", "Serves or makes" and "Where it's from". One-pot sits beside difficulty.
- Number fields are 96 px with "minutes" after them in Muted, tied with `aria-describedby`.
- Difficulty gets a fourth option, "None", chosen as the form opens; the spec's "Not set" wraps at 390 px.
- Serves or makes is a segmented control; switching keeps what was typed in each, and only the chosen one is sent.
- The cuisine and course chip groups load on their own: a spinner and "Loading cuisines…", and ErrorWithRetry within the group on failure; the rest of the form keeps working.
- Checks run on Save: each message sits under its field in Danger, and focus goes to the first field in error. A 400 naming no field is a danger Banner above Save, which takes focus; a network or 5xx failure is a toast, with everything typed kept. On success the recipe's page opening is the confirmation.
- "Save recipe" is the screen's one peach button, at the form's foot at every width.
- "Add a recipe" on the list is a secondary Button with a plus, under the title and above the count, for everyone. Signed out, `/recipes/new` sends you through sign-in and back.
- The private mark sits above the meta on a card, and right under the title on the recipe page. Public recipes stay unmarked.
- What's missing is a warning Banner (not a butter Note, which means time) at the end of the intro, listing the spec's lines in order. It shows only on a private recipe that's missing something. A part the recipe lacks leaves no other trace: no empty facts line, blobs, stepper or headings.
- TimeBlobs: colour and shape go by position, so a lone cook time is a peach "Cook". Each blob keeps a third of the row.

## Proposed rule change (docs/design.md)

- Rules › Shape and Space and shape › Corners: 10 px corners for "checkboxes and marks".
- Components: a new row for the private mark.
- Components › Banner: warning also covers "what a private recipe is still missing".
- The fun, rationed › Blobs: "A recipe shows only the times it has, one to three, in that order; each keeps its third of the row, and the colours and shapes go by position."

## Components

- **Private mark** (new): `frontend/src/dino/private-mark.tsx`, exported as `PrivateMark`, with no props. A Lucide lock (14 px, 2.5 px stroke, hidden from screen readers) and "Private" in Small Ink, on Surface with a 2 px transparent border and `rounded-check` corners. It isn't interactive. Stories: on Ground, on a card, under a title, at 200% text and under forced colours. It can grow into `RecipeMark` with a `kind` when a second mark arrives (TAS-126, TAS-128).
- **TimeBlobs** (changed): `times` becomes a tuple of one to three `TimeBlob`s. With no times the page leaves TimeBlobs out. New stories: one blob at phone and laptop widths, at 200% text and under forced colours.
