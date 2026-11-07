# TAS-122: Add the dock and top-bar tabs to Dino

Canvas: https://claude.ai/artifact/NrdKZaTP7rfjFzD8EpzGeF

## Boards

- `Main.dc.html` (Icons until there's room): the top bar with its tabs at 640, 834, 1024 and 1280 px. From 640 px the tabs sit after the wordmark; under 1024 px the current tab shows its icon and name and the others their icons; from 1024 px every tab is named.
- `Phone.dc.html` (Phones: the dock): the dock at 390 px on Recipes (top and scrolled to the end, with the 104 px kept clear), on Household (the current tab moves), and signed out (one tab, so no dock).
- `Dock.dc.html` (Dock: every state): two, three and four tabs, another tab current; hover, pressed and focus on the current and other tabs; forced colours.
- `TopBarTabs.dc.html` (TopBarTabs: every state): named (from 1024 px) and compact (640 to 1023 px), two tabs; hover, pressed and focus on the current and other tabs, compact icon hover and focus; forced colours.

## Decisions

- Under 640 px the navigation is the Dock, a floating pill in Dock colours 20 px from the sides and foot (plus the safe area); from 640 px it is TopBarTabs in the top bar. Neither shows with fewer than two tabs, so signed out there is no navigation.
- One row at every width: the bar's height never changes. Compact tabs (640 to 1023 px) name only the current tab; the others are icons whose accessible name is their `label`.
- Dock and TopBarTabs take the same `tabs` prop, two to four `{ to, label, icon }`, in order. The current tab is the one whose `to` the page is under, from the router; it carries `aria-current="page"`. Both are links in a list inside a `nav` named "Main".
- The bar's order is wordmark, tabs, search, account, so focus meets the tabs before search and account; the dock comes after the top bar in the page's order.
- Every page with the dock keeps 104 px free at its foot (62 px dock, 20 px under it, 22 px of air).
- Dock: 62 px tall, tabs 46 px tall and 4 px apart; the current one a peach pill (icon 20 px and name in Label) taking the rest of the row, the others 64 px wide with a 22 px icon in On dock. Hover On dock at 10%, pressed at 20%, focus a 3 px On dock ring, flush; Peach hover and Peach pressed on the current tab.
- TopBarTabs: 44 px pills 8 px apart with a 2 px transparent border, names in Label; current Peach, others Ink on the ground; hover Surface, pressed Line, focus a 3 px Ink ring, flush.
- Forced colours: the dock takes a CanvasText border on Canvas, and the current tab Highlight with HighlightText, on both components.
- Motion: nothing slides between tabs; colours change in 120 ms.
- Dino imports no area: the app's shell passes the tab list to both.

## Proposed rule change

None.

## Components

- Dock: new, built in this issue.
- TopBarTabs: new, built in this issue.
- TopBar: changed in this issue to take the tabs as a prop and place them after the wordmark.
