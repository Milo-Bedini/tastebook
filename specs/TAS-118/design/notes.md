# TAS-118: Add a photo to your recipe — design

Canvas: https://claude.ai/artifact/9at2aHTmCQcxB9ziYRDVee

## Boards

- `Main.dc.html` — The photo at its real shape: the recipe form at phone width (390 px) with a Photo field after Description, empty and filled, drawn at the recipe's 7:5 crop with Replace photo and Remove photo under it.
- `photo-field.dc.html` — PhotoField, every state at a phone's field width: empty, uploading (faded preview with progress, Cancel upload), uploaded, not a photo, too big, couldn't upload (Try again / Choose another), removed (toast with Undo), save while it uploads, and save failed because the upload failed.
- `form-laptop.dc.html` — The form on a laptop (1280 px): one 640 px column, the photo capped at 400 px wide from tablets up, and the drag-over state ("Drop the photo to add it").
- `recipe-photo.dc.html` — RecipePhoto with a household's own photo: the recipe's page (7:5 polaroid, taped) and its card in the list (4:3), beside a recipe with no photo showing the filler. No credit line.
- `proposed-rule-change.dc.html` — Proposed rule change to `docs/design.md` (Space and shape, Photos).

## Decisions

- The Photo field sits after Description in the form's first group; Title stays first (the only required field, where focus starts).
- One "Add a photo" button opens the device's own picker (`input type="file" accept="image/*"`). No crop, rotate or filters: the photo is centred and cropped by the page, as Commons photos are.
- The photo uploads as soon as it's chosen; the recipe keeps it only once saved. Save recipe waits for an upload in progress; if that upload fails, the recipe isn't saved and focus goes to the field.
- Type (JPEG, PNG, WebP, HEIC) and size (up to 10 MB) are checked on choosing, before any request, with the file's own type and size in the message; Tastebook checks them again on upload and its refusal shows as Couldn't upload.
- The preview frame isn't tilted (it has controls under it). Remove photo is a ghost button with its icon, so Save recipe stays the one primary button; removing empties the field, moves focus to Add a photo and offers Undo in a toast.
- Dragging a file onto the field works for pointers on wider screens, as an extra to the button, never the only way.
- Screen readers: the field is a group named "Photo", described by its help or error; "Uploading the photo" and "Photo uploaded" are announced politely, the percentage is visual only. Alt text is "The photo for <title>", falling back to "The photo for this recipe".
- HEIC can't preview in most browsers, so its preview waits for Tastebook's first thumbnail, showing the filler until then.
- An uploaded photo has no credit (not the uploader's name: personal data once published, TAS-119). It uses the same thumbnails list, sizes, shapes, lazy loading and can't-load filler as a Commons photo.
- Assumed, since the triage brief wasn't read during design: the file types, the 10 MB limit, and one photo per recipe.

## Proposed rule change

`docs/design.md`, Space and shape, Photos: replace "always with the credit" with "A photo from Wikimedia Commons always has its credit; a photo a household uploads has none." Why: the credit honours Commons licences; a household's own photo has none to honour, and the only credit possible is the uploader's name.

## Components

- **PhotoField** (new, Dino): a labelled field holding one photo. Props to grow into: `label`, `help`, `error`, `photo` (a stored photo, a file being uploaded with its progress, or none), `shape` (`hero` 7:5; `card` 4:3 if another form needs one), `onChoose(file)`, `onRemove()`, `onRetry()`, `onCancel()`. The upload itself lives in the recipes area's API hook, not in Dino.
- **RecipePhoto** (changed, Dino): takes a photo Tastebook stores as well as one from Wikimedia Commons; shows no credit for an uploaded photo.

The board HTML loads the canvas runtime (`support.js`) and Dino's bundle beside it, and its sample photo from the canvas's assets; the PNGs are the boards as rendered.
