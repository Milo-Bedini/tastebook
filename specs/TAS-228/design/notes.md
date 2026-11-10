# TAS-228: Paginate the recipes page

Canvas: https://claude.ai/artifact/B2726wiGKXPAyzA8xQPVf9

## Boards

- `Main.dc.html` (Previous, page, Next): the recipes page on a phone at 390 px on page 2, page 1 (no Previous) and the last page (no Next), and at 320 px with two-digit pages; Pagination sits 32 px under the list, "Page X of Y" centred over Previous and Next, which share the row.
- `States.dc.html` (Moving between pages): Next pressed (old page stays, focus on the heading, "Finding page 3…" with a spinner), the page arrived ("49–72 of 137 recipes"), a filter changed (back to page 1, "1–24 of 52 recipes"), a page that failed to load (Error with retry, no count or pager), a page past the last (shows page 1, address replaced), and one page of matches (no pager).
- `Wider.dc.html` (Tablet and laptop): Pagination in one row from 420 px of room, in the list's column on a laptop at 1288 px and a tablet at 768 px; the filter sheet's "Show 52 recipes" counts every match.
- `Pagination.dc.html` (Pagination, new Dino component): default, first page, last page, hover, pressed, focus, narrow (under 420 px), narrow first page and forced colours; its props (`page`, `pageCount`, `to(page)`, `label`), how it behaves, and the proposed `docs/design.md` row.

## Decided at Design Review

- What should the page show between pressing Next and the next page arriving? Old page, "Finding page 3…"
- After changing page, where should keyboard focus land? The page heading
- On page 1 and the last page, should Previous or Next be hidden, or shown disabled? Hidden
- Should the top of the list also say which page you're on? Shouldnt we have a 1-24 of 312 or something like that somewhere? (Drawn as the count line above the list: "25–48 of 137 recipes", using the response's `count`; one page of matches keeps "4 recipes". The pager at the foot keeps "Page X of Y".)

## Proposed rule change

Add a Components row to `docs/design.md`:

> **Pagination** · Moves through a long list a page at a time (`design/dino/pagination.dc.html`), under the list in a nav named "Pages": Previous and Next are secondary buttons as links, named in words with their chevrons, and "Page 2 of 6" in Label between them. Page 1 has no Previous and the last page no Next; one page has no pager. One row from 420 px of room; narrower, the line sits above the two links, which share the row. The page is in the address.

## Components

- `Pagination` (new): `frontend/src/dino/pagination.tsx`, exported from Dino's index, with a story per state on its board. Built in this issue's PR, as the issue exists to add pagination.
- `Button` (secondary, as a link through `asChild`), `PolaroidCard`, `Spinner`, `ErrorWithRetry`, `FilterChip` and `RemovableChip` reused unchanged.
