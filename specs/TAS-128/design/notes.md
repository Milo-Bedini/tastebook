# TAS-128: Share a private recipe by link

Canvas: https://claude.ai/artifact/NzAEmMBULWdq92SLUxm8nd

## Boards

- `Main` — A Share by link switch under Public: the author's private recipe page at phone width with sharing off, on (read-only link field and Copy link), and on while the recipe isn't ready to publish.
- `Share-states` — The share link's states: turning on (saving), link copied, couldn't copy, turning off asks first (ConfirmDialog, Keep link / Turn off link), link turned off, couldn't turn it on, made public (the share switch goes and the link stops), and another member (no switches).
- `Switch-description` — Switch with a help line: Dino Switch's new optional `description` prop, off, on and saving.
- `Shared-page` — The shared recipe, opened from the link, at phone width: signed out, signed in (any household, including the recipe's own) and loading; noindex and the "<recipe> · Tastebook" title.
- `Shared-not-found` — A link that's off or unknown: the recipe page's own "Recipe not found", and the couldn't-load state with Try again.
- `Shared-laptop` — The shared recipe at laptop width, on the recipe page's existing grid.

The `Shared-page` board's notes ran 42 px past its 2380 px frame on the canvas; the hand-off copy is 2480 px tall so nothing is clipped. Nothing else differs from the canvas.

## Decided at Design Review

- When the author turns sharing on again, does it make a new link or bring back the old one? A new link
- Should turning the link off ask first? Ask first
- What happens to a live share link when the author makes the recipe public? Link stops
- Does the shared page name the recipe's author? No name
- When a member of the recipe's own household opens the share link, what do they see? The shared page

## Proposed rule changes

None.

## New or changed components

- Switch (changed): an optional `description` help line in Small Muted under the row, tied with `aria-describedby`; a disabled reason replaces it while shown. Stories gain `with-description` and `with-description-is-on`.
