# TAS-195: Add ListPicker to Dino

Canvas: https://claude.ai/artifact/BuTfajT2RwdSXbsCyqExfW

## Boards

- `Main.dc.html` (ListPicker, every state): one row per list on Surface, with off, is-on, is-hover, is-pressed (box at 92%), is-focus (3 px Ink ring on the row's 14 px edge), saving (`aria-busy`), didn't save (Small Danger line with its icon), a 60-character name that wraps, and an empty list's count words.
- `groups.dc.html` (ListPicker: groups and forced colours): a fieldset per group ("Just you", then the household's name), and under forced colours the off, ticked (Highlight with a HighlightText check), focused (CanvasText ring) and didn't-save rows; plus the suggested props and what a screen reader hears.

## Decided at Design Review

None.

## Proposed rule change

None.

## Components

- `ListPicker` (new, in Dino; built in this issue): a group (fieldset and legend) of `ListPickerRow`s, each taking `name`, `count`, `checked`, `onCheckedChange`, `saving` and `error`. Its box is Checkbox row's 28 px `Checkbox`, without the strike-through. It knows no lists, so recipes can use it on TAS-125's sheet without a slot.
