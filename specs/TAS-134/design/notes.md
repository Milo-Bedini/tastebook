# TAS-134: Delete your account — design hand-off

Canvas: https://claude.ai/artifact/VTKbPDdeQBuMVGmRd3Nk8W

## Boards

- `docs/design/picnic/account-delete.dc.html` — The Delete your account section: a fourth section at the foot of /account after Your data, with a danger "Delete account" button; phone (390), 320 px with keyboard focus, and laptop (1288) with the dialog open (384 px wide from 424 px up).
- `docs/design/picnic/account-delete-numbers.dc.html` — The dialog's first step, what goes and what stays: Checking (loading), Couldn't check (ErrorWithRetry), with others in the household, the last member, nothing written yet, and staff (a notice with only Close). Lines with a number of 0 are left out; Send code is primary.
- `docs/design/picnic/account-delete-code.dc.html` — The dialog's second step, the code: Sending, Too many codes (429), Code sent, Deleting, Not 6 digits, Wrong code (400), Stopped (409), Sending a new code, New code sent, Too many new codes, Couldn't delete (toast; the dialog keeps the code).
- `docs/design/picnic/account-delete-deleted.dc.html` — After a 204: signed out on the home page with the "Your account is deleted." success toast, and Jo's Favourites showing Sam's public recipe "by a former member".
- `docs/design/dino/confirm-dialog-steps.dc.html` — The changed Dino component: several lines of description, content (children), an error with no field, loading, failed, a notice, 320 px, forced colours, and the proposed props.
- `docs/design/dino/confirm-dialog-steps-rule-change.dc.html` — Proposed rule change to docs/design.md's Dialog row (below).

## Reading the boards

- **Loading buttons look stretched on the boards; they aren't in the design.** On Dialog-code (Sending, Deleting, Sending a new code) and ConfirmDialog (With content), the button showing its loading label spills across the dialog. That's a canvas artefact: the board's own `.grid` layout style collides with the `grid` class inside Dino's Button. The real Button keeps its size while loading ("Send code keeps its size", as the Sending caption says).
- **Dialog-numbers' last two notes are clipped by its frame.** They read:
  - Checking and Couldn't check keep the title, so the screen reader names the dialog straight away; the Loading line shows after half a second, as States › Loading says. Try again only fetches the numbers again.
  - Staff keep the title as asked, and the dialog becomes a notice: its way out reads "Close", as nothing is being cancelled, and there's no Send code.

## Decided at Design Review

- If someone cancels the dialog after a code was sent and opens it again, where should it start? Start again at step one

## Proposed rule change

docs/design.md › Components › Dialog, appended: "A dialog that needs something first (a code from an email) asks for it in a step before the action, under the same title: that step's button is primary and names what it does ("Send code"), and only the action itself is danger. A dialog that can only explain (a staff account can't be deleted) has no action, and its way out is "Close"." If turned down, Send code becomes a secondary button beside Cancel.

## Components

- **ConfirmDialog** (changed): `description` takes a string or lines; new `children` (between description and buttons), `error` (Small Danger, `role="alert"`), `status` (`ready` | `loading` | `error`, with no confirm while loading or failed), `tone` (`danger` | `primary`), `notice` (only the way out, "Close" unless `cancelLabel` says otherwise). A step is a re-render with the same title. Stories: Lines, WithContent, Error, Loading, Failed, Notice, each open, with both baselines.
