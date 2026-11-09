# TAS-129: Report a public recipe

Canvas: https://claude.ai/artifact/QZsqbHGcyaTpLD5kif299w

## Boards

- `Main.dc.html`: a public recipe's page at phone width, signed in, signed out and as its author; Report recipe is a ghost button with Lucide Flag under a hairline after Save to list and Make a copy, absent on one's own recipe.
- `Variant-A.dc.html` (Reasons as radio rows): the report sheet, opened, filled and sending; the four reasons as a radio list with a line each, an optional note (Text area, 500 characters at most) and Send report.
- `Report-states.dc.html`: the sheet with no reason chosen, a report that didn't send, and a recipe you've reported that's still up (Reported, disabled, with its reason).
- `After-report.dc.html`: after a report: the reporter back where they came from with a toast; a restored recipe staying up with Reported; anyone else at its address seeing "Recipe not found"; a list keeping it as the unavailable recipe.
- `Author-hidden.dc.html`: the author's view while a report is open: the "Hidden while a report is reviewed" warning Banner with EyeOff under the credit, Public held on and disabled, and "Hidden for review" on their recipe card.
- `Laptop.dc.html`: laptop, 1280 px: the sheet centred at 576 px, and the author's notice in the intro column.
- `Radio-list.dc.html`: the new Dino Radio list with every state (off, chosen, hover, pressed, focus, no hint, error, disabled, forced colours), its props and what it grows into.
- `Banner-icon.dc.html`: Banner with an optional `icon` replacing its tone's, beside the tones as today, under forced colours and with an action.
- `Proposed-rule-change.dc.html`: the two changes to `docs/design.md`'s Components.

## Decided at Design Review

- While a report is open, who still sees the recipe? Only its author
- Can members of the author's household report its recipe? No, other households only
- While a report is open, can the author make the recipe private? No, held until reviewed
- Can someone who reported a recipe report it again after staff restore it? No, one report each
- Should the author's recipe card say it's hidden? Yes, “Hidden for review”
- What should a hidden recipe saved in someone's list say? Keep it as it is

## Proposed rule changes (`docs/design.md`, Components)

- **Banner:** warning also covers a recipe hidden while a report is reviewed; a banner may take its own icon in place of its tone's, in the tone's colour (EyeOff for a hidden recipe).
- **Radio list (new row):** one choice from two to six options that each need a line to explain them: a fieldset of native radios, List picker's row with a round 28 px box; error turns the rings Danger with why under the list; under forced colours a chosen box is Highlight with HighlightText.

## Components

- Radio list: new (Dino), first used for the report sheet's reasons.
- Banner: changed, gains an optional `icon?: LucideIcon` and a `warning-with-icon` story with its baselines.
