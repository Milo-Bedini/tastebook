# Forced colours keeps an SVG's own colour, and axe misreads text there

- **Added:** 2026-10-29 · **Applies to:** spec | implement | review · **Issue:** TAS-83
- **Paths:** `frontend/src/dino/**`, `frontend/e2e/**`
- **Rule:** `pnpm lint` (`tools/biome/svg-forced-colours.grit`) refuses an `<svg>`, or an icon imported from `lucide-react` (which renders one), with its own colour class. It's needed because Chromium gives SVG elements `forced-color-adjust: preserve-parent-color`, so a `currentColor` stroke on `text-pop` stays the brand colour under forced colours. And under `page.emulateMedia({ forcedColors: 'active' })`, Chromium reports the unforced `-webkit-text-fill-color` that axe's `color-contrast` reads, so it fails text painted in `CanvasText` on `Canvas`; `e2e/fixtures.ts` turns that one rule off when forced colours are on.
- **Why:** The TAS-83 spec drew the squiggle as `currentColor` on `text-pop` "so forced colours redraws it". The first forced-colours e2e run showed the stroke still peach, and axe failed every line of text on home and not found though the screenshot showed black on white.
- **Re-check by:** 2027-01-29
