# TAS-116: Add ingredient lines and groups to the recipe form — design

Canvas: https://claude.ai/artifact/JKz1LSodtcHYUX5PuRKDPm

## Boards

- `Main.dc.html` — **Ingredients, phone** (390 px): the section as it opens, filled in with lines and a group, a line's sheet, a group's sheet and a just-picked line's sheet.
- `Ingredients-states.dc.html` — **Reorder, checking and adding** (390 px): the Reorder mode after a move and at an end, Save refused with the sheet open and closed, a group with no name, picking (with the add option), adding, couldn't add, the list loading and failing, removed, and refused by Tastebook.
- `Ingredients-laptop.dc.html` — **Ingredients, laptop** (1280 px): the phone's rows in the form's 640 px column, and the sheet centred at 576 px.
- `Combobox-add-option.dc.html` — **Combobox, the add option**: every state of Combobox's new `addOption` item, how it works and what it may grow into.

## Decisions

- Each line is one row that reads as the recipe will (name in Label L, then quantity, note and "· optional" in Body Muted); no row shows a number. Pressing a row opens a Dino Sheet with Amount, Unit, Note, the Optional switch, Remove and Done.
- A group is a section under a 2 px Line rule, headed by an h3 row button in Caption type that opens its own sheet; its lines sit on a 2 px Line rail with their own picker, "Add an ingredient to <group>".
- Reorder is its own mode from a secondary button at the heading's end (shown from two entries), with Move up and Move down per row; nothing is disabled at the ends, the buttons say why on press. Moving next to a group heading crosses into or out of the group.
- Save's first error opens that row's sheet on its field; rows in error carry their message under their detail.
- Adding and loading touch only the pickers: status lines beside a spinner, a toast when adding fails, ErrorWithRetry when the list can't load.
- Nothing changes shape with width: the laptop keeps the phone's layout in the 640 px column.

## Proposed rule changes

None.

## Components

- Combobox (changed): an optional `addOption?: { label, onAdd }`, drawn as the list's last option after a hairline below the matches, or alone when nothing matches.
