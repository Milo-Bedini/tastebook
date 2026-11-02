# TAS-109: Leave the household or remove a member — design

Canvas: https://claude.ai/artifact/PrdTzYBiBxTC3hgCaeHZtR

## Boards

- **Main** (`Main.dc.html`, 1400 × 1640): the household page on a phone (390 px) with three members, Remove at the end of each other member's row and Leave as the last section; the only member (no Remove, no Leave section); a long name at 320 px wrapping beside Remove, with Leave household focused.
- **Remove** (`Remove.dc.html`, 1400 × 2600): removing a member: the confirm dialog (focus on Cancel), Removing…, removed (row gone, focus on the Members heading, "Removed Ann Okafor" toast), already gone (info toast), couldn't remove (alert toast), and the dialog at 320 px with the buttons stacked.
- **Leave** (`Leave.dc.html`, 1400 × 2600): leaving: the confirm dialog naming who stays (plural and singular), Leaving…, left (the new household of one, focus on the page title, "You left The Bedinis" toast), couldn't leave (alert toast), and the dialog at 320 px.
- **Laptop** (`Laptop.dc.html`, 1400 × 1460): the page at 1280 px with the remove dialog open; the 400 px column is unchanged and the dialog is 384 px, centred.
- **ForcedColours** (`ForcedColours.dc.html`, 1400 × 1260): the page and the leave dialog under Windows High Contrast Black.

## Decisions

- Remove and Leave household are secondary buttons on the page; the danger fill appears only in the ConfirmDialog each opens. "Save name" stays the screen's one peach button.
- Remove's visible label is "Remove"; its accessible name is "Remove <name>" (visible word first, WCAG 2.5.3). Your own row has no Remove.
- Leave is its own section, last on the page (after Invite someone once TAS-147 lands): a Title heading, one line on what happens, and "Leave household".
- The only member sees neither Remove nor the Leave section. Removing the last other member also removes the Leave section.
- The confirm dialog's danger button says "Remove member", not "Remove <name>": Dino's Button never wraps, and long names would overflow at 320 px. The title names who. The spec's page test and confirm step change to "Remove member". The way out stays "Cancel" (no cancelLabel).
- Leave's dialog names who stays, joined as a list ("Ann Okafor, Jo Mensah and Sam Reid"), with "stays" for one and "stay" for more; its confirm is "Leave household".
- Focus opens on Cancel in both dialogs. After a removal it moves to the Members heading (tabindex −1); after leaving, to the "Your household" title (tabindex −1), with the in-text focus ring.
- Only the row being removed shows "Removing…"; other rows' Remove stay pressable (the server's household row lock keeps removals in order).
- "Already gone" is a status toast with the info icon and the list redraws; failures are alert toasts worded like the rename's failure, and the page doesn't change.
- After leaving, nothing navigates: the page redraws as the new household of one, and the top bar doesn't change.
- Long names wrap in the row; Remove keeps its size. At 320 px the dialog's buttons stack, Cancel first.

## Proposed rule changes

None.

## Components

No new or changed Dino components: the boards use Button (secondary, danger, loading), Avatar, Input, IconButton, SearchInput, Squiggle, Wordmark, ConfirmDialog and Toast as they stand.
