# TAS-110: Join a household from an invite link — design hand-off

Canvas: https://claude.ai/artifact/8Feka8fqHmbx8rGYm58w4i

## Boards

- `Main.dc.html` — the join page at /join/<token> on a phone (390 px), in six states: join offer, sign in to join, already a member, doesn't work (404), expired and cancelled.
- `Join.dc.html` — joining: the confirm dialog when others stay in your household and when you're its only member, "Joining…", joined (the household page with a toast), a link that stopped working mid-join and couldn't join (an alert toast).
- `Waits.dc.html` — before the page: Loading and ErrorWithRetry for the session, then the invite link, then (for the offer only) your own household.
- `Narrow.dc.html` — at 320 px: long household and member names wrap, and the dialog's buttons stack with Cancel first.
- `Laptop.dc.html` — at 1280 px: the same 400 px column, with the 384 px dialog centred.
- `ForcedColours.dc.html` — the offer and the dialog under Windows High Contrast Black.

## Decisions

- One squiggle, and only on good news: under "Join" on the offer and "invited" when signed out; never under the household's name. Already-a-member and the three dead links have plain titles, like the not-found page.
- The offer reuses the household page's Members list, read-only (Avatar and name, 56 px rows, no "(you)", no Remove), with "Join household" as the one peach button after the list.
- Signed out, the page says only that the link works: no name, members or count (UK GDPR, since a forwarded link could be seen by anyone). "Sign in to join" is the peach button.
- Each dead link says which case it is and what to do, with "Back to Tastebook" as its one button. Being a member wins over the link's state.
- Join asks first in an alertdialog titled "Join <household>?" that says what happens to the household you'd leave: who stays, by name ("stays" for one person, "stay" for more), or that it will be deleted if you're its only member. The confirm is the danger "Join household" and focus starts on Cancel.
- Once joined, the page replaces the link in history, lands on /household and shows the toast "You joined <household>".
- If the link dies during the join (409/404), nobody moves: an info toast appears, the page redraws as the dead link and focus goes to its title (tabindex -1).
- If the join fails (offline or a 5xx), an alert toast appears ("Couldn't join the household. Check your connection and try again."), the offer stays and focus goes back to "Join household".
- Waits use Loading ("Checking your account…", "Opening the invite link…", "Getting your household…"), and each failure uses ErrorWithRetry naming what didn't load.
- One column at every width. From tablets up, toasts sit at the bottom right and are 356 px wide.

## Proposed rule changes

None.

## New or changed components

None: the page uses the existing Dino components (Wordmark, IconButton, SearchInput, Button, Avatar, Squiggle, Input, Loading, ErrorWithRetry, toasts).
