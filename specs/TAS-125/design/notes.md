# TAS-125: Add a recipe to any of your lists from its page

Canvas: https://claude.ai/artifact/5RJM69Q4Po18isiA8Kh4wq

## Boards

- `Main.dc.html` (Save to list opens a sheet of your lists): phone, 390 px. A secondary "Save to list" button in the recipe intro opens a sheet of every list the person sees, grouped "Just you" (Favourites first) and the household, each a native checkbox ticked when it holds the recipe; a tick saves and an untick removes at once; a "Saved in …" line under the time blobs names each list that holds it, Favourites included, and focus returns to the button on close.
- `picker-states.dc.html` (The sheet's other states): loading, couldn't load (Error with retry), a save that didn't go through (the row turns back with why under it), only Favourites (no other lists, foot links to the Lists page), a household's private recipe, and signed out (sign-in with `next` back to the recipe).
- `laptop.dc.html` (Laptop): 1280 px. The button and "Saved in" line in the intro's right-hand column; the same sheet, centred at 576 px, as on tablet.
- `list-picker.dc.html` (ListPicker, every state): the new collections-local component's row: off, on, hover, pressed, focus, saving, didn't save, long name, empty list.

## Decided at Design Review

- When someone unticks a list in the sheet, should it say so with a toast and Undo? No toast: the tick is Undo
- After signing in from Save to list, should the recipe's page open with the sheet already open? Back with the sheet open
- Should the sheet let someone make a new list, or point to the Lists page? Link to the Lists page
- Should the "Saved in …" line under the blobs name Favourites as well as the other lists? Name Favourites too

## Proposed rule changes

None.

## New or changed components

- ListPicker (new): `frontend/src/collections/list-picker.tsx`, kept in the collections area (one use). Rows reuse Checkbox row's 28 px box without the strike-through; handed to the recipe page through a slot, as `FavouriteSlot` does. Not ListRow, which keeps its one use.
