# TAS-123: Save recipes to Favourites — design hand-off

Canvas: https://claude.ai/artifact/7ugMt5XqBPDbjBUYCLb8Ak

## Boards

- **Main** (1800 × 1440): phone, 390 px. The Lists tab as an index with one row per list (Favourites only for now); `/lists/favourites` as a polaroid grid, newest saved first, with one unavailable recipe; the moment after unsaving (card leaves, count drops, "Removed from Favourites · Undo" toast); and the heart on every card in the recipe list.
- **Lists-states** (2240 × 1340): phone. The Lists index empty ("Nothing saved yet", dashed fan), Favourites empty (EmptyState with "Browse recipes"), loading (Dino's Loading, "Finding your lists…"), failed (ErrorWithRetry, "Couldn't load your lists"), and signed out (redirect to sign-in with `next`, no tabs).
- **Saving** (1900 × 1340): phone, a recipe's page. The FavouriteButton at the end of the title row: not saved, saved (toast with Undo), save failed (heart turns back, toast with Try again), and signed out (goes through sign-in, saves on return).
- **Lists-wider** (1400 × 2240): laptop 1280 px (Favourites in four columns, tabs named in the top bar) and tablet 768 px (Lists index, rows two a row from 640 px, current tab named with its icon). Focus order.
- **Navigation** (1600 × 1180): TopBar and Dock with their first real tabs, Recipes (BookOpen) and Lists (Library): dock states under 640 px, top bar at 1280, 768 and 640 px.
- **FavouriteButton** (1400 × 1060): every state (off, on, hover, pressed, focus, saving), its place on a recipe's page and on a card, forced colours, and its props.
- **UnavailableRecipe** (1400 × 1060): the placeholder for a saved recipe made private or deleted: default, heart hover and focus, long title, laptop width, forced colours, and its props.

## Decisions

- Lists is an index; each list has its own address (`/lists/favourites`), ready for named, household and shared lists. Costs one extra press while Favourites is the only list.
- Favourites always shows on the index, even empty.
- Saving and unsaving are optimistic: the heart turns at once, takes `aria-busy` and ignores presses until the request settles; a toast confirms with Undo, or turns it back with Try again on failure. No confirm on unsave.
- The heart is named "Favourite" on a recipe's page and "Favourite <title>" on a card, with `aria-pressed` for state. On cards it sits at the meta's end, outside the card's link and above its stretched target.
- After unsaving on a list's page the card leaves at once and focus moves to the next card's heart (or the heading when none is left).
- Signed out: only the Recipes tab, so no tabs or dock; `/lists` redirects to sign-in with `next`; pressing a heart goes through sign-in and saves on return.
- Lists is current on `/lists` and under it; a recipe opened from Favourites makes Recipes current, with its Back link reading "Favourites".
- The Lists tab uses Library in Ink, not a heart: the heart and pink belong to the save toggle.
- An unavailable recipe keeps its place in the list, is not a link, and says only "Made private or deleted" (no who, for UK GDPR minimisation); the heart is its only action. If it goes public again it becomes the recipe's polaroid again.
- The household's own recipes can be saved too.

## Proposed rule changes

None.

## Components

- **TopBar** (changed): first real tabs, Recipes and Lists; no new props.
- **Dock** (changed): first real tabs, Recipes and Lists; no new props.
- **FavouriteButton** (new): `src/dino/favourite-button.tsx`; props `saved`, `onSavedChange`, `busy?`, `label`. Grows into the list picker once named lists arrive.
- **UnavailableRecipe** (new): `src/dino/unavailable-recipe.tsx`; props `title`, `action`.
- **PolaroidCard** (changed): gains an `action?: ReactNode` slot for the heart.
