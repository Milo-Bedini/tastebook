# Design system: Picnic

Tastebook's look, agreed on a design canvas on 2026-10-29; it replaces Enamel. Warm and playful, like a picnic spread on a rug: a plum ground, pastels you can almost taste, photos as taped polaroids, and a serif with a little flourish over a rounded sans. The fun is rationed so the kitchen jobs (find a recipe, cook it, shop for it) stay calm and legible.

[`design/picnic/`](design/picnic/) holds the canvas's artboards: browse and recipe, cooking mode, the shopping list, and the sign-in page in each of its states (`sign-in*.dc.html`), the name page a new account meets after signing in (`welcome*.dc.html`), the account page, where you change your name and units (`account-page*.dc.html`), and the household page, where members rename the household, see who's in it, remove a member or leave, and share an invite link (`household-page*.dc.html`). [`design/dino/`](design/dino/) holds the Dino redesign's: the foundations (colour, type, links, space, icons), the layout at phone, tablet and laptop widths, every component in each of its states, the polaroid with no photo, the mark and a forced-colours check; the account end of the top bar (`account*.dc.html`, `avatar.dc.html`, `menu.dc.html`); the confirm dialog's way-out label with its proposed rule change (`confirm-dialog*.dc.html`); and the text area (`text-area*.dc.html`). They're reference markup that renders only with the canvas's runtime, so each has a PNG of itself beside it (`buttons.dc.png` for `buttons.dc.html`); a PR that changes a board renders its PNG again. Where a board and this file disagree, this file wins. Change it through PRs like the code.

**Moving to Picnic.** The code runs Picnic's tokens and fonts (`frontend/src/dino/picnic.css`), but each component keeps its old shape until the Dino project restyles it to its board. Until a component has moved, build with it as it is and add no new styling to it; anything that needs new visual work is designed in Picnic.

## Principles

Judge every screen and component against two references: Nielsen Norman Group's [ten usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/) and Apple's [design principles](https://developer.apple.com/design/human-interface-guidelines/design-principles). Where they meet the rules below, the rules say how; where a rule is silent, the principles decide. Review cites them by name ("NN/g 1", "Apple Agency").

**NN/g's heuristics, as Tastebook applies them**

1. **Visibility of system status.** Every press shows a pressed state; anything that waits shows that it's working; a change is confirmed (a toast, an announced count).
2. **Match between the system and the real world.** Kitchen words, not system words: "Serves 4", "Makes 16 cookies", "Fruit and veg".
3. **User control and freedom.** Offer Undo rather than asking first, wherever the action can be undone; every sheet and dialog has a clear way out.
4. **Consistency and standards.** One look means one thing (peach means the main action, mint means chosen), and platform behaviour wins over invention: native selects, radio groups that answer to arrow keys.
5. **Error prevention.** Make the wrong input hard to give (number keyboards for numbers, limits on steppers) before explaining it.
6. **Recognition rather than recall.** Show what's on (filters as chips), show options rather than asking people to remember them; an icon alone only where it's universally known.
7. **Flexibility and efficiency of use.** Keyboard paths for desk use, large targets for the kitchen; text that scales with the reader's setting.
8. **Aesthetic and minimalist design.** Every element earns its place, the playful ones most of all (see [The fun, rationed](#the-fun-rationed)).
9. **Help users recognise, diagnose and recover from errors.** Say what went wrong and how to fix it, with an example, and offer the retry beside it.
10. **Help and documentation.** Help text under the field and a way out in every empty state, so nothing needs a manual.

**Apple's principles, as Tastebook applies them**

- **Purpose:** each screen does one household job well (find a recipe, cook it, shop for it).
- **Agency:** never trap someone in a flow; guided steps can be skipped; mistakes can be undone.
- **Responsibility:** collect only what Tastebook needs and say why; fonts are bundled so no visitor is sent to Google.
- **Familiarity:** build on platform conventions and keep a behaviour the same everywhere once it's set; give clear feedback.
- **Flexibility:** accessible from the start, at any text size, by touch, keyboard and screen reader.
- **Simplicity:** just what's necessary, in exactly the words needed, with a clear hierarchy (one primary action per screen).
- **Craft:** care for every detail, from a polaroid's tape to the wording of an error; shipping is not the finish line.
- **Delight:** warmth comes from the whole (the polaroids, the pastels, a squiggle under the right word), never decoration that slows the task.

## Voice

- British English, sentence case everywhere: "Save recipe", "Clear filters", never "Save Recipe".
- Plain and specific, and a little warm. A control says exactly what it does ("Add 10 things", "Next step"); the main action may be friendly ("Let's get cooking") as long as it stays clear.
- Errors say what's wrong and how to fix it, with an example: "Enter a number, like 4." No apologies, no "Invalid input".
- A dialog says exactly what will happen, with real numbers: "Your 12 private recipes will be deleted. Your 3 public recipes stay."
- An empty state says what's empty, why, and the way out: "No recipes match. Nothing is vegetarian, one-pot and under 30 minutes yet. Try removing a filter."
- No emoji in the interface.

## Colour

Tastebook has **one theme, dark**: no light theme and no toggle. The root sets `color-scheme: dark`, so native controls, scrollbars and the browser's own surfaces match.

Token names follow Tailwind's `--color-*` convention, so `--color-peach` is `bg-peach`, `text-peach` and so on. Contrast is against Ground unless noted; every text pair reaches 4.5:1 ([WCAG 2.2, 1.4.3](https://www.w3.org/TR/WCAG22/#contrast-minimum)) and field borders reach 3:1 ([1.4.11](https://www.w3.org/TR/WCAG22/#non-text-contrast)).

| Token | Value | Use | Contrast |
| --- | --- | --- | --- |
| `--color-ground` | `#1c1233` | Page background | |
| `--color-surface` | `#2a1d47` | Quiet panels (a step's ingredients, icon buttons), sheets and dialogs | |
| `--color-surface-pressed` | `color-mix(in oklab, var(--color-surface) 70%, var(--color-field))` | An icon button while pressed | |
| `--color-ink` | `#fff4ea` | Text | 16.4 (14.2 on Surface) |
| `--color-muted` | `#cbbfe0` | Secondary text | 10.2 (8.8 on Surface) |
| `--color-pop` | `#ffb38a` | An emphasised word in a heading, its squiggle, the step number | 10.2 |
| `--color-field` | `#8f7fb0` | Borders of fields, outlined chips and checkboxes | 4.9 (4.3 on Surface) |
| `--color-line` | `#3a2c5c` | Hairlines between rows (decorative) | |
| `--color-peach` | `#ffb38a` | The main action; where you are (the current tab, the current step) | |
| `--color-peach-hover` | `color-mix(in oklab, var(--color-peach) 80%, var(--color-ink))` | A peach control under the pointer | |
| `--color-peach-pressed` | `color-mix(in oklab, var(--color-peach) 86%, var(--color-on-pastel))` | A peach control while pressed | |
| `--color-mint` | `#8fe3c0` | Chosen and done: filters that are on, ticked boxes, finished steps, add buttons, the ingredients a step names | |
| `--color-mint-hover` | `color-mix(in oklab, var(--color-mint) 80%, var(--color-ink))` | A mint control under the pointer | |
| `--color-mint-pressed` | `color-mix(in oklab, var(--color-mint) 86%, var(--color-on-pastel))` | A mint control while pressed | |
| `--color-butter` | `#ffe08a` | Time and heads-ups: timers, durations, "start the night before" notes | |
| `--color-pink` | `#ff9fc6` | Favourites and diet stickers | |
| `--color-pink-hover` | `color-mix(in oklab, var(--color-pink) 80%, var(--color-ink))` | A pink control under the pointer | |
| `--color-pink-pressed` | `color-mix(in oklab, var(--color-pink) 86%, var(--color-on-pastel))` | A pink control while pressed | |
| `--color-on-pastel` | `#2a1440` | All text and icons on a pastel or on Paper | 9.5 peach, 10.9 mint, 12.8 butter, 8.7 pink |
| `--color-paper` | `#fff8ef` | Polaroid frames | 15.7 with On pastel |
| `--color-tape` | `rgb(255 224 138 / 0.85)` | The tape on a polaroid (decorative) | |
| `--color-dock` | `#fff4ea` | The floating tab bar and toasts | |
| `--color-on-dock` | `#2a1440` | Text and icons on the dock | 15.2 |
| `--color-success` | `#8fe3c0` | Status: done, saved | 11.8 |
| `--color-warning` | `#ffe08a` | Status: needs a look | 13.8 |
| `--color-danger` | `#ff9a8a` | Status: errors, destructive actions | 8.7 |
| `--color-danger-hover` | `color-mix(in oklab, var(--color-danger) 80%, var(--color-ink))` | A danger control under the pointer | |
| `--color-danger-pressed` | `color-mix(in oklab, var(--color-danger) 86%, var(--color-on-pastel))` | A danger control while pressed | |
| `--color-on-danger` | `#1c1233` | Text on danger | 8.7 |
| `--color-scrim` | `rgb(8 4 18 / 0.66)` | The backdrop behind a sheet or dialog | |

The pastels stand out from the ground (9:1 and more), so they need no outline. Every pastel control still has a 2 px transparent border, which forced colours draws, so they stay outlined there.

The page is Ground; panels, sheets and dialogs are Surface. Selected text is Pop at 40% under Ink.

## Type

| Role | Face | Size / line height | Weight |
| --- | --- | --- | --- |
| Display XL (screen titles) | Instrument Serif | 46 / 44 px | 400, one word may be italic |
| Display L (sheet titles) | Instrument Serif italic | 34 / 36 px | 400 |
| Title (section headings) | Instrument Serif italic | 28 / 30 px | 400 |
| Caption (polaroid captions) | Instrument Serif italic | 21 / 22 px | 400 |
| Step number (cooking mode) | Instrument Serif italic | 96 / 80 px | 400 |
| Step (cooking mode) | Nunito | 23 / 34 px | 700 |
| Timer | Nunito | 38 / 40 px | 800 |
| Body | Nunito | 16 / 24 px | 600 |
| Small | Nunito | 13 / 17 px | 700 |
| Label (buttons, chips) | Nunito | 15 / 20 px | 800 |
| Label L (large buttons) | Nunito | 19 / 24 px | 800 |

Both faces are under the SIL Open Font License and are **bundled with the app**: never loaded from Google Fonts, which would send every visitor's IP address to Google (see UK GDPR in `AGENTS.md`, Standards) and fail offline. Instrument Serif has one weight, so hierarchy comes from size and italics, never bold serif. Numbers that line up (amounts, times, timers) use tabular figures. The sizes hold at every width: a title is Display XL on a laptop too. Reading text stays under about 68 characters a line.

**Links** in text are Ink, underlined 2 px in Field, 3 px below the text; on hover the underline turns Ink. A link standing alone ("All recipes") is Label type with its icon, 44 px tall, and underlined on hover.

## Space and shape

- **Spacing:** a 4 px base: 4, 8, 12, 16, 20, 24, 32, 48. Space siblings with `gap`, not margins. Side gutters are 20 px on phones and 32 px from tablets up ([Layout](#layout)).
- **Corners:** pill (999 px) for controls (buttons, chips, one-line fields, steppers) and the dock; 32 px for a sheet's top corners; 28 px for the timer card; 24 px for cards, panels and a text area; 20 px for notes and banners; 10 px for checkboxes; 14 px for a checkbox row's hover fill and focus ring; 16 px for a list's options (the panel's corner less its border and padding); the three blob shapes for a recipe's times; square for polaroids. Something inside a rounded panel takes the panel's corner less its border and padding, never a pill inside a rounded box.
- **Shadows:** the **press shadow** (`0 5px 0` in On pastel) sits under the screen's main action and the timer card, so they look pressable; pressed, they sink 3 px and the shadow shrinks to match (the sunk shadow, `0 2px 0` in On pastel). The **lift** (`0 12px 28px rgb(0 0 0 / 0.35)`) sits under polaroids, the dock and sheets. On a polaroid card the lift rises under the pointer (`0 18px 36px rgb(0 0 0 / 0.42)`) and settles while pressed (`0 6px 14px rgb(0 0 0 / 0.35)`). Nothing else has a shadow.
- **Photos:** in a polaroid (below), 4:3 in lists and 7:5 at the top of a recipe, always with the credit. **No photo:** the polaroid keeps its frame and caption, and the photo's place shows one of two fillers: a hand-drawn place setting (a plate, fork and knife in On pastel on Paper, inside a dashed edge) or the rug (On pastel gingham on Paper with an empty plate). A recipe always gets the same one, picked from its ID, so neighbours tend to differ. Neither uses a pastel, which would claim a meaning. Enamel's cuisine plate goes.
- **Motion:** 120 ms ease-out for a control's state changes; 150 ms ease-out fades and slides for sheets, dialogs and toasts; never over 200 ms. Nothing moves on its own except a running timer and the spinner of something that's working. `prefers-reduced-motion` turns it all off, the spinner included.

## Layout

Designed phone first, at three widths ([`design/dino/layout.dc.html`](design/dino/layout.dc.html)).

| Width | Gutters | Recipe list | Filters |
| --- | --- | --- | --- |
| Phone, under 640 px | 20 px | Two polaroids a row, after an optional featured one | In a sheet |
| Tablet, 640 to 1024 px | 32 px | Three a row | In a sheet, from a "Filters · 2" button that counts what's on |
| Laptop, 1024 px and up | 32 px, content up to 1200 px wide | Four a row | In a 260 px column beside the list |

- **Top bar:** the wordmark on the left. On a laptop, the search field (360 px) on the right; narrower, a search icon button. The account end sits at the bar's right end at every width ([`design/dino/account.dc.html`](design/dino/account.dc.html)): signed in, the avatar, which opens the account menu; signed out, a secondary Sign in button. With it, the bar's columns gap 8 px under 640 px and 24 px from 640 px up, and the search field's own line on a phone spans the whole row. Until it's known whether someone is signed in, the bar shows neither.
- **Navigation:** while Recipes is the only tab, there is none. With a second tab, the tabs go in the top bar from tablets up (the current one a peach pill), and phones get the dock.
- **Active filters** sit above the list as removable chips, with Clear filters beside them.
- **A recipe on a laptop** has two columns, 5 to 7: the photo with the ingredients under it on the left, the ingredients staying in view while the page scrolls; the title, description, blobs, servings, units and method on the right. Narrower, one column in that order: photo, title, blobs, servings, ingredients, method.

## States

Every control has the same five, drawn on the Dino boards.

- **Hover** (pointers only): a pastel fill moves 20% towards Ink (`color-mix(in oklab, var(--color-peach) 80%, var(--color-ink))`); an outlined control's border turns Ink and it fills with Surface; an outlined control on a pastel or the dock (a note's or a toast's action) keeps its border and fills with its text colour at 10% (20% while pressed); ghost and icon buttons fill with Surface or Line. A polaroid card straightens a little and lifts.
- **Pressed:** the main action sinks 3 px and its press shadow shrinks to 2 px. Every other control shrinks a touch (97%; small round ones 92 to 94%), and a pastel fill moves 14% towards On pastel. A polaroid card settles.
- **Focus:** a 3 px ring in Ink, flush against the control with no gap; on the dock it's On dock, on a butter note On pastel. A field's border turns Ink and thickens to 3 px. A radio group (the segmented control) takes one ring round the whole group, and arrow keys move the choice. Never a ring standing off a pill. A link in text takes the ring 2 px off the text, with 4 px corners.
- **Disabled:** a Surface fill, a dashed Field border and Muted text. It stays focusable (`aria-disabled`, not `disabled`) and a line under it says why: "Tick at least one thing to add." A stepper at its limit needs no line, as its count says why. When the reason would be long, leave the control enabled and explain on press.
- **Loading:** the control keeps its size, its label turns to the "-ing" form ("Saving…") beside a spinner, it takes `aria-busy` and ignores presses. A region that loads shows blank polaroids that don't shimmer and a line saying what's happening ("Finding recipes…"), and only after half a second.

## The fun, rationed

Picnic works only while its playful parts stay rare. Review checks each screen against these.

- **Polaroids** frame photos in lists and at the top of a recipe: a Paper frame (10 px, 8 px on small ones) with a Caption underneath, tilted 2 to 4 degrees, alternating direction. A featured polaroid may carry tape. The recipe's photo credit sits inside its frame.
- **Tilt** is for polaroids, stickers and browse's filter chips (1 to 2 degrees) only. Never tilt text you read for more than a glance, anything you type into, the method, ingredient lists, dialogs, or any control in cooking mode. Above about 150% text, tilt turns off everywhere: filter chips wrap, polaroids sit straight at full width, and stickers move below the photo instead of overlapping it.
- **Stickers** carry a recipe's diet tags in pink, or a featured recipe's time in butter, tilted 6 to 12 degrees; two at most on one photo. They describe and are never buttons.
- **The squiggle** goes under one word of a screen's title, a recipe's name or a step number, in Pop. One per screen.
- **Doodles** (a hand-drawn arrow and a note in italic serif, like "start it tonight!") go on browse and empty states only, one per screen, and repeat nothing the screen doesn't already say in words: they're hidden from screen readers.
- **Blobs** (three fixed irregular shapes in peach, butter and mint) hold a recipe's prep, cook and soaking times, and nothing else.
- **Dotted leaders** join an ingredient to its amount wherever amounts are listed.

## Components

The set lives in `frontend/src/dino/` (Dino: shadcn/ui, restyled) and is exported from its `index.ts`. Build pages from these; add a component to `src/dino/` on its third use (`AGENTS.md`, rule of three). To add one from shadcn/ui, run `pnpm --filter frontend ui:add <name>`, restyle it to these tokens and export it from `index.ts`. Each component's states follow [States](#states) and are drawn on the Dino boards. Each has stories beside it (`<file>.stories.tsx`, run with `pnpm --filter frontend storybook`): one per variant and per state, named as on the boards (`is-hover`, `is-pressed`, `is-focus`, `is-disabled`, `is-on`), and every story passes axe and its interaction tests in CI. Every story also has two screenshot baselines that CI compares it with, one in `frontend/visual/baselines/` and one under forced colours in `frontend/visual/baselines/forced-colours/`, and `frontend/src/dino/boards.ts` names each story's board image, so review can compare a changed baseline with its board.

| Component | Notes |
| --- | --- |
| Button | Primary: peach fill, the press shadow, one per screen. Secondary: a 2 px field outline. Ghost: no fill. Danger: danger fill. 44 px tall; 64 px in cooking mode and for a main action pinned to a screen's foot. |
| Icon button | A 44 px circle on Surface (48 px in cooking mode), never peach (the Picnic boards' peach Back and Search buttons are superseded); a toggle that's on fills with its colour (pink for Favourite, with a filled heart). Always has an accessible name, and a toggle keeps one name while `aria-pressed` says whether it's on. |
| Avatar | The first letter of a name, trimmed and upper-cased, in Label L Ink on a 44 px Surface circle with a 2 px transparent border ([`design/dino/avatar.dc.html`](design/dino/avatar.dc.html)); a name with no letters shows a 20 px UserRound icon. One size, never a pastel. It's decorative: the button it sits in is named for the person ("Account for Milo Bedini"). As the account button it takes the icon button's states, and while its menu is open it fills with Line and its border turns Ink. |
| Menu | A short list of things to go to or do, opened from a button ([`design/dino/menu.dc.html`](design/dino/menu.dc.html)): a Surface panel with a 2 px Field border, 24 px corners, 6 px padding and no shadow, 224 to 320 px wide, 8 px below its button with their right edges lined up, never nearer than 20 px to the screen's edge. An optional heading in Label, then a Line hairline; it's text, not an item, and wraps. Items are Body, at least 44 px tall, with 16 px corners: hover fills with Line; pressed with Surface pressed, without shrinking; keyboard focus adds the focus ring on the item's own edge. Under forced colours the item under the pointer takes the ring too. It fades in and out over 150 ms and doesn't dim the page. |
| Field | Pill, 48 px, a 2 px field border on the ground (no fill), visible label above (visually hidden only for search), help text below, error replaces help in danger with an icon and says how to fix it. Numbers use `inputmode="numeric"`. Search has a 44 px clear button with no fill of its own. |
| Text area | Longer text, like a recipe's description or a method step ([`design/dino/text-area.dc.html`](design/dino/text-area.dc.html)). The field's border, type and states, with 24 px corners, 10 px padding top and bottom and 18 px at the sides, at least three lines (96 px) tall; it grows with its text and never scrolls inside where the browser can size it to its text, with no maximum height and no drag handle. Where it can't, it keeps 96 px, scrolls inside and can be dragged taller. Long words and web addresses wrap. Label above, help or error below, as for a field. |
| Combobox | The ingredient picker: a field over a list on Surface with a 2 px field border and no shadow. The active option (the one Enter picks) has a Line fill and the focus outline on its own edge; matched letters are bold. Chosen items show as removable chips above. |
| Filter chip | A toggle (`aria-pressed`), pill. Off: field outline. On: mint fill with a check icon, so the state never rests on colour alone. A removable chip names what it removes in its label. |
| Sticker | Replaces Tag: describes a recipe (Vegan, Gluten-free) on its photo. Not interactive. |
| Stepper | Servings: minus (outlined), "Serves 4", plus (mint), or a yield: "Makes 16 cookies"; the count is announced (`aria-live="polite"`). |
| Segmented control | Two to four options, one chosen, as native radios in a Surface track: the chosen one is mint with a check. One tab stop; arrow keys move the choice. |
| Checkbox row | Shopping list rows: 48 px tall, a 28 px box with 10 px corners; ticked, the box fills mint with a check and the row is struck through in muted and moves to the end of its group. |
| Switch | Turns one thing on or off ([`design/dino/switch.dc.html`](design/dino/switch.dc.html)): the label first in Body, the switch at the row's end, and the whole row (48 px tall, 8 px padding, 16 px gap) is the target, its hover fill and focus ring on the row as on the checkbox row. The track is a 52 × 32 px pill: off, a 2 px Field border and a Muted thumb at the start; on, mint with a 2 px transparent border and an On pastel thumb at the end holding a mint check, so on never rests on colour alone. The thumb slides 20 px in 120 ms. Hover turns off's border Ink and on's mint to its hover; pressed shrinks the switch to 94%. Disabled keeps its thumb's end and check, in Field, on a Surface track with a dashed border, under a Muted label and over its reason. |
| Polaroid card | Replaces Recipe card: a polaroid with the recipe's name as its caption; meta below it in Small muted where the list needs it. The focus ring is square round the card and its meta, untilted. |
| Note | A butter panel for heads-ups ("Left out salt, water and vegetable oil: you probably have them"), with at most one action, an On pastel outlined button. |
| Banner | A 2 px border in a status colour with its icon, on Surface: warning for an import's gaps, success for a clean import, danger for a failure. At most one action, under its text. |
| Toast | Dock colours, pill, a short message and at most one action ("Saved to Favourites · Undo"). |
| Sheet | Slides up over a scrim, Surface colour, 32 px top corners, a grab handle, a title in Display L, a close button. Full width on a phone; from tablets up, centred and at most 576 px wide. Escape, the close button and the scrim close it. For light tasks (adding a recipe to the list, filters). |
| Dialog | For anything that can't be undone: says exactly what happens; the danger button names the action ("Delete account"), the other is "Cancel". |
| Empty state | A dashed empty polaroid, what's empty and why, the way out ("Clear filters"), and perhaps the screen's one doodle. |
| Error with retry | What failed, how to fix it, and Try again beside it: "Couldn't load recipes. Check your connection, then try again." One component for every place a load can fail. |
| Loading | See [States](#states): blank polaroids and a line saying what's happening, after half a second. |
| Method | A real ordered list: each step's number in the serif italic in Pop (38 px on a laptop, 32 px on a phone) beside Body text (17/27 on a laptop), a hairline between steps, under about 62 characters a line. Ingredients aren't highlighted here; cooking mode does that. |
| Dock | Phones only, once there's a second tab. The tab bar: a floating pill in dock colours, 62 px tall; the current tab is a peach pill with its label, the others are icons with accessible names. |

**Cooking mode** keeps the screen awake and drops the playful parts that get in the way: a progress bar of segments (mint done, peach current), the step number in Step number type with its squiggle, the step in Step type with the ingredients it names in mint, and Back and Next at 64 px. A duration in a step ("60 to 90 minutes") is a butter button that starts a timer; a running timer shows as a butter card with a ring and a pause button, and follows you to later steps as a small pill. A range counts to its first check, then says how much longer it may need. A step's own ingredients sit below it with their amounts.

## Rules

Review checks new UI against these.

**Colour**

- Peach only for the main action and where you are. One peach button per screen.
- Mint for chosen and done, butter for time and heads-ups, pink for favourites and diet stickers: never swapped, never decoration.
- Text on a pastel or on Paper is always On pastel.
- Success, warning and danger only for status, never decoration.
- Tokens only, never a literal colour.

**Shape**

- Pills for controls (one-line fields among them), 24 px for cards and text areas, 32 px for sheets, 10 px for checkboxes, square for polaroids.
- The press shadow only under the main action and the timer; the lift only under polaroids, the dock and sheets.
- Every pastel control, every filled panel (notes, toasts, sheets, dialogs) and the dock's current tab has a 2 px transparent border, which forced colours draws.

**Type and icons**

- Instrument Serif for headings, captions, the step number and the wordmark only; Nunito for everything else.
- Fonts bundled with the app, never loaded from Google.
- [Lucide](https://lucide.dev) icons at a 2 to 2.5 px stroke. An icon on its own always has a label for screen readers.
- Icons, ticks and the timer's ring are drawn in `currentColor`, never a fixed colour, so forced colours can recolour them.

**State**

- A chosen or ticked state shows an icon as well as its fill, so it survives forced colours and colour blindness.
- A list's active option (the one Enter picks while focus stays in a search field) carries the focus outline beside its fill.
- Under `forced-colors: active`, cooking mode's finished segments fill with `CanvasText` and the current one with `Highlight`, and the ingredients a step names are underlined.

**Touch and motion**

- Every control at least 44 px tall (WCAG 2.5.8 asks for 24); 48 px or more in cooking mode.
- Motion under 200 ms, for state changes, sheets, dialogs and toasts only; respect "reduce motion".
- Dark only: no light theme, no theme toggle.

## Brand

- **Wordmark:** "Tastebook" in Instrument Serif italic, in ink (Dino's `Wordmark`).
- **Mark:** the wordmark's italic "t" in On pastel on a Peach square, with the squiggle under it in On pastel ([`design/dino/mark.dc.html`](design/dino/mark.dc.html), option B). It's the home-screen and touch icon and the favicon, and it reads down to 16 px. The letter is outlined, so the icons never wait on the font.

## Still to settle

Designed when a project needs them: the Accounts and households components (tabs), and cooking mode's timer and step view beyond the Picnic board. Each built screen still gets its own forced-colours check; the Dino boards checked the components.
