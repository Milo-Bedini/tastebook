# TAS-124: Make your own lists, personal or household

Canvas: https://claude.ai/artifact/MKYTheAVfp3jqywSfbZyaR

## Boards

- `docs/design/picnic/lists-groups.dc.html`: the Lists index at phone width, split into two groups, "Just you" (Favourites first, then personal lists by name) and the household's name, with New list as the screen's one peach button.
- `docs/design/picnic/lists-new.dc.html`: the New list sheet: opened (focus in Name, "Just you" chosen), Household chosen, refused for a duplicate name, and the new list's empty page with its "Made <name>" toast.
- `docs/design/picnic/lists-list-page.dc.html`: a list's page for any list: a personal list, a household list, a recipe removed with an Undo toast, and Favourites as built in TAS-123 plus its "Just you" mark.
- `docs/design/picnic/lists-rename-delete.dc.html`: the Rename list sheet, the renamed page, the delete confirmation for a household list, and the Lists index after deleting.
- `docs/design/picnic/lists-groups-laptop.dc.html`: laptop (1280 px): the groups' rows two a row and the New list sheet centred at 576 px; notes on tablet and focus order.
- `docs/design/dino/segmented-control-help.dc.html`: Dino's SegmentedControl for "Who's it for?" with a visible label and a help line, in every state (Just you, Household, focus, a household of one, a long household name).
- `docs/design/picnic/lists-row.dc.html`: the collections area's ListRow holding any list: default, empty, one recipe, long name, hover, pressed and focus.

## Decisions

1. A list is personal (only you) or household (every member sees it, removes from it, renames it and deletes it). You choose when you make it, and it starts on "Just you".
2. Favourites stays personal and first, and can't be renamed or deleted.
3. A name is required, up to 60 characters, and unique per owner: your personal lists among themselves, a household's among the household's. "Favourites" is reserved in both. Errors say how to fix it.
4. Personal lists live at `/lists/<name>`, household lists at `/lists/household/<name>`, so their addresses never clash.
5. The index shows who sees a list by the group it sits in; a list's page shows it with a mark under the title (User and "Just you", or Users and the household's name), never a control.
6. Rename (secondary) and Delete list (ghost, Trash2) sit under the count on any list but Favourites.
7. Every card on a named list has Remove (an X icon button), acting at once with an Undo toast, as Favourites' heart does; focus moves to the next card's Remove. Adding from a recipe's page is TAS-125.
8. Deleting can't be undone, so it asks first with ConfirmDialog as it is, saying who loses the list and that its recipes stay. After deleting you land on Lists with focus on its heading and a toast.
9. Making a list closes the sheet and opens its page with focus on its heading and a "Made <name>" toast (no Undo).
10. An empty named list says "Nothing here yet"; Favourites keeps "Nothing saved yet".
11. A list someone else deleted while open shows "This list has gone. Someone in <household> deleted it." with All lists.

## Proposed rule changes

None.

## New or changed components

- SegmentedControl (`src/dino/segmented-control.tsx`): changed. Two optional props: `labelVisible` shows the legend above the track in Label (Ink); `description` puts a line in Small Muted under the track, joined to the fieldset by `aria-describedby`. Existing uses pass neither and look as they do now.
- List row (`src/collections/lists-page.tsx`'s ListRow): changed to hold any list's name and an empty list of any kind. It stays in the `collections` area (one page uses it).
- ConfirmDialog: used as it is, no change.
