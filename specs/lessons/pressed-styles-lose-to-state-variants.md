# A pressed style loses to an aria-* or data-* state fill

- **Added:** 2026-10-29 · **Applies to:** spec | implement | review · **Issue:** TAS-101
- **Paths:** `frontend/src/dino/*.tsx`
- **Rule:** `pnpm lint` (`tools/biome/pressed-fill-over-state.grit`) asks for the stacked variant. It's needed because Tailwind v4 sorts `aria-*` and `data-*` variants after `active`, so at equal specificity a state's fill (`data-highlighted:bg-line`) beats a plain `active:bg-surface-pressed`. The rule reads one string at a time, so keep a state's fill and its pressed fill in the same class string.
- **Why:** On PR #98 a menu item never showed Surface pressed, since Radix highlights the item under the pointer, and the avatar button lost its pressed fill to its expanded fill, since Radix opens the menu on pointerdown.
- **Re-check by:** 2027-01-29
