import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { after, before, describe, it } from 'node:test';

// Each plugin's fixtures: a bad one that must report the plugin's message and a good one that must report nothing.
// They're linted in one run of the root's Biome with the root's biome.json, so a Biome upgrade or an edit that stops
// a rule matching fails here.

type Fixture = { plugin: string; what: string; path: string; source: string; reports: string[] };

type Diagnostic = { category: string; message: string; location: { path: string } };

const message = {
  radius:
    "Use one of Picnic's corner tokens (rounded-pill, -sheet, -timer, -card, -note, -check, -row, -option, -blob-1, -blob-2, -blob-3), not an arbitrary radius.",
  let: 'Use const, with map, filter or reduce in place of reassigning, not let (AGENTS.md › Frontend).',
  pressedButton:
    "Give a hand-built button with a hover style a pressed one too, like Dino's secondary and ghost buttons' active:scale-97 active:bg-line (docs/design.md › States).",
  functionDeclaration: 'Write a named const arrow function, not a function declaration (AGENTS.md › Frontend).',
  colour:
    "Use one of Picnic's colour tokens (bg-ground, text-ink, border-field, bg-peach and the rest in docs/design.md › Colour), not a literal colour.",
  cssColour:
    "Use one of Picnic's colour tokens (var(--color-ink), bg-ground, border-field and the rest in docs/design.md › Colour), not a literal colour.",
  spacing:
    "Use Picnic's 4 px spacing steps (1, 2, 3, 4, 5, 6, 8 and 12, as in p-4 or gap-3), or --spacing(n) inside an arbitrary value, not a literal length.",
  fontSize:
    "Use one of Picnic's type roles (text-display-xl, -display-l, -title, -caption, -step-number, -step, -timer, -body, -small, -label, -label-l, -method-number, -method-number-laptop, -method-laptop), not an arbitrary font size.",
  lineHeight: "Use a type role's own line height (text-body, text-title and the rest set it), not an arbitrary one.",
  fontFamily: 'Use font-serif (Instrument Serif) or font-sans (Nunito), not an arbitrary font family.',
  dino: 'Dino knows no feature: nothing in src/dino/ imports from an area (AGENTS.md › Domain areas).',
  app: "An area doesn't import from src/app/; the app imports the areas (AGENTS.md › Domain areas).",
  direction:
    'Dependencies between areas point one way: any area may depend on households; collections, kitchen and importing on recipes; planning on recipes and kitchen (AGENTS.md › Domain areas).',
  internals:
    "Reach another area through its index.ts ('@/<area>' or '../<area>'), not its internals (AGENTS.md › Domain areas).",
  ownModule:
    "Don't mock Tastebook's own modules: render the real code and mock its HTTP with MSW (defaults in src/test/handlers.ts, server.use(...) per test) (AGENTS.md › Tests).",
  fetch:
    "Don't mock fetch or the API client: mock HTTP with MSW (defaults in src/test/handlers.ts, server.use(...) per test) (AGENTS.md › Frontend).",
  image:
    "Give an <img> crossOrigin='anonymous', as RecipePhoto does, so its host can't set a cookie; only an image imported from a local file goes without (specs/lessons/wikimedia-photos-load-anonymously.md).",
  svg: "Set an SVG's colour on an HTML wrapper it inherits from, as the empty state's Doodle does, or add forced-colors:text-current, so forced colours can redraw it (specs/lessons/forced-colours-keeps-an-svgs-own-colour.md).",
  pressedFill:
    "Stack the state's variant on the pressed fill (data-highlighted:active:bg-surface-pressed, aria-expanded:active:*:bg-surface-pressed), as icon-button.tsx does with aria-pressed:active, so the pressed fill wins (specs/lessons/pressed-styles-lose-to-state-variants.md)."
};

const fixtures: Fixture[] = [
  {
    plugin: 'no-arbitrary-radius',
    what: 'an arbitrary radius',
    path: 'frontend/src/recipes/radius-bad.tsx',
    // biome-ignore lint/plugin: the fixture's radius is the point
    source: `export const Card = () => <div className="rounded-[7px]" />;\n`,
    reports: [message.radius]
  },
  {
    plugin: 'no-arbitrary-radius',
    what: 'a corner token',
    path: 'frontend/src/recipes/radius-good.tsx',
    source: `export const Card = () => <div className="rounded-card" />;\n`,
    reports: []
  },
  {
    plugin: 'no-let',
    what: 'a let in the frontend',
    path: 'frontend/e2e/let-bad.ts',
    source: `let total = 0;\ntotal += 1;\nexport const count = total;\n`,
    reports: [message.let]
  },
  {
    plugin: 'no-let',
    what: 'a let outside the frontend',
    path: 'tools/scripts/let-good.ts',
    source: `let total = 0;\ntotal += 1;\nexport const count = total;\n`,
    reports: []
  },
  {
    plugin: 'button-pressed-state',
    what: 'a button with a hover style and no pressed one',
    path: 'frontend/src/recipes/button-bad.tsx',
    source: `export const Save = () => <button type="button" className="hover:bg-line">Save</button>;\n`,
    reports: [message.pressedButton]
  },
  {
    plugin: 'button-pressed-state',
    what: 'a button with a pressed style',
    path: 'frontend/src/recipes/button-good.tsx',
    source: `export const Save = () => (\n  <button type="button" className="hover:bg-line active:bg-line">\n    Save\n  </button>\n);\n`,
    reports: []
  },
  {
    plugin: 'button-pressed-state',
    what: 'a hover-only button in Dino',
    path: 'frontend/src/dino/button-good.tsx',
    source: `export const Save = () => <button type="button" className="hover:bg-line">Save</button>;\n`,
    reports: []
  },
  {
    plugin: 'no-function-declaration',
    what: 'a function declaration and a default one',
    path: 'frontend/src/recipes/function-bad.ts',
    source: `export function total() {\n  return 1;\n}\nexport default function count() {\n  return 2;\n}\n`,
    reports: [message.functionDeclaration, message.functionDeclaration]
  },
  {
    plugin: 'no-function-declaration',
    what: 'a const arrow function',
    path: 'frontend/src/recipes/function-good.ts',
    source: `export const total = () => 1;\n`,
    reports: []
  },
  {
    plugin: 'token-only-styling',
    what: 'a literal colour, spacing, font size, line height and font family',
    path: 'frontend/src/recipes/styling-bad.tsx',
    source: [
      `export const brand = '#ff6b4a';`,
      `export const Fill = () => <div className="bg-[rgb(255,0,0)]" />;`,
      `export const Pad = () => <div className="p-[7px]" />;`,
      `export const Size = () => <p className="text-[13px]" />;`,
      `export const Line = () => <p className="leading-[1.1]" />;`,
      `export const Face = () => <p className="font-[Arial]" />;`,
      ''
    ].join('\n'),
    reports: [message.colour, message.colour, message.spacing, message.fontSize, message.lineHeight, message.fontFamily]
  },
  {
    plugin: 'token-only-styling',
    what: 'tokens and a value built from them',
    path: 'frontend/src/recipes/styling-good.tsx',
    source: `export const Card = () => <div className="bg-ground p-4 text-body font-serif mt-[--spacing(7)]" />;\n`,
    reports: []
  },
  {
    plugin: 'token-only-styling',
    what: 'a computed rgb() asserted in a test',
    path: 'frontend/src/recipes/styling-good.test.tsx',
    source: `import { expect, it } from 'vitest';\n\nit('is ink', () => {\n  expect(getComputedStyle(document.body).color).toBe('rgb(0, 0, 0)');\n});\n`,
    reports: []
  },
  {
    plugin: 'token-only-styling-css',
    what: 'a literal colour and an arbitrary spacing in @apply',
    path: 'frontend/src/recipes/styling-bad.css',
    source: `.card {\n  color: #ff6b4a;\n}\n\n.row {\n  @apply p-[7px];\n}\n`,
    reports: [message.cssColour, message.spacing]
  },
  {
    plugin: 'token-only-styling-css',
    what: 'a colour token',
    path: 'frontend/src/recipes/styling-good.css',
    source: `.card {\n  color: var(--color-ink);\n}\n\n.row {\n  @apply p-4;\n}\n`,
    reports: []
  },
  {
    plugin: 'token-only-styling-css',
    what: "picnic.css, where the tokens' colours are defined",
    path: 'frontend/src/dino/picnic.css',
    source: `:root {\n  --color-ink: #1d1d1b;\n}\n`,
    reports: []
  },
  {
    plugin: 'area-boundaries',
    what: 'Dino importing an area',
    path: 'frontend/src/dino/areas-bad.ts',
    source: `export { RecipeCard } from '@/recipes';\n`,
    reports: [message.dino]
  },
  {
    plugin: 'area-boundaries',
    what: 'an area importing the app, against the direction, and an internal',
    path: 'frontend/src/recipes/components/areas-bad.ts',
    source: [
      `export { router } from '@/app/router';`,
      `export { SaveButton } from '../../collections';`,
      `export const kitchen = () => import('@/kitchen');`,
      `export { useHousehold } from '@/households/use-household';`,
      ''
    ].join('\n'),
    reports: [message.app, message.direction, message.direction, message.internals]
  },
  {
    plugin: 'area-boundaries',
    what: "imports along the directions, through each area's index",
    path: 'frontend/src/planning/areas-good.ts',
    source: [
      `export { RecipeCard } from '@/recipes';`,
      `export { Pantry } from '../kitchen';`,
      `export { useHousehold } from '@/households';`,
      `export { Button } from '@/dino/button';`,
      `export { client } from '@/api/client';`,
      `export { planWeek } from './plan-week';`,
      ''
    ].join('\n'),
    reports: []
  },
  {
    plugin: 'no-mocking-own-code',
    what: "a test mocking Tastebook's own module, fetch and the API client",
    path: 'frontend/src/recipes/mocking-bad.test.tsx',
    source: [
      `import { vi } from 'vitest';`,
      ``,
      `import { api } from '@/api/client';`,
      ``,
      `vi.mock('@/recipes/api');`,
      `vi.spyOn(globalThis, 'fetch');`,
      `vi.stubGlobal('fetch', vi.fn());`,
      `vi.spyOn(api, 'GET');`,
      `globalThis.fetch = vi.fn();`,
      ''
    ].join('\n'),
    reports: [message.ownModule, message.fetch, message.fetch, message.fetch, message.fetch]
  },
  {
    plugin: 'no-mocking-own-code',
    what: 'a test mocking an outside package',
    path: 'frontend/src/recipes/mocking-good.test.tsx',
    source: `import { vi } from 'vitest';\n\nvi.mock('sonner');\n`,
    reports: []
  },
  {
    plugin: 'anonymous-images',
    what: 'an image from elsewhere without crossOrigin',
    path: 'frontend/src/recipes/image-bad.tsx',
    source: `export const Photo = ({ url }: { url: string }) => <img src={url} alt="" />;\n`,
    reports: [message.image]
  },
  {
    plugin: 'anonymous-images',
    what: 'an anonymous image, and one imported from a local file',
    path: 'frontend/src/recipes/image-good.tsx',
    source: [
      `import photo from './photo.jpg';`,
      ``,
      `export const Photo = ({ url }: { url: string }) => <img src={url} crossOrigin="anonymous" alt="" />;`,
      `export const Local = () => <img src={photo} alt="" />;`,
      ''
    ].join('\n'),
    reports: []
  },
  {
    plugin: 'svg-forced-colours',
    what: 'an SVG with its own text colour',
    path: 'frontend/src/recipes/svg-bad.tsx',
    source: `export const Squiggle = () => <svg className="text-pop" aria-hidden="true" />;\n`,
    reports: [message.svg]
  },
  {
    plugin: 'svg-forced-colours',
    what: 'an SVG redrawn under forced colours, and one colouring through its wrapper',
    path: 'frontend/src/recipes/svg-good.tsx',
    source: [
      `export const Squiggle = () => <svg className="text-pop forced-colors:text-current" aria-hidden="true" />;`,
      `export const Doodle = () => (`,
      `  <span className="text-pop">`,
      `    <svg aria-hidden="true" />`,
      `  </span>`,
      `);`,
      ''
    ].join('\n'),
    reports: []
  },
  {
    plugin: 'pressed-fill-over-state',
    what: "a state's fill beside a plain pressed one",
    path: 'frontend/src/recipes/pressed-bad.tsx',
    source: `export const Option = () => <div className="data-highlighted:bg-line active:bg-surface-pressed" />;\n`,
    reports: [message.pressedFill]
  },
  {
    plugin: 'pressed-fill-over-state',
    what: "the state's variant stacked on the pressed fill",
    path: 'frontend/src/recipes/pressed-good.tsx',
    source: `export const Option = () => (\n  <div className="data-highlighted:bg-line active:bg-surface-pressed data-highlighted:active:bg-surface-pressed" />\n);\n`,
    reports: []
  }
];

const root = join(import.meta.dirname, '../..');
const rootConfig = JSON.parse(readFileSync(join(root, 'biome.json'), 'utf8')) as Record<string, unknown> & {
  plugins: string[];
};
const plugins = rootConfig.plugins.map((plugin) => basename(plugin, '.grit'));

describe('the Biome plugins', () => {
  const reported = new Map<string, Diagnostic[]>();
  const directory = mkdtempSync(join(tmpdir(), 'biome-plugins-'));

  before(() => {
    // The root's config with its own plugins, minus what keeps a temporary directory out (VCS and file includes).
    const { $schema: _schema, vcs: _vcs, files: _files, ...config } = rootConfig;
    writeFileSync(
      join(directory, 'biome.json'),
      JSON.stringify({ ...config, plugins: rootConfig.plugins.map((plugin) => join(root, plugin)) })
    );
    for (const { path, source } of fixtures) {
      mkdirSync(join(directory, dirname(path)), { recursive: true });
      writeFileSync(join(directory, path), source);
    }
    const biome = createRequire(join(root, 'package.json')).resolve('@biomejs/biome/bin/biome');
    const report = join(directory, 'report.json');
    const run = spawnSync(
      process.execPath,
      [
        biome,
        'lint',
        '--reporter=json',
        `--reporter-file=${report}`,
        '--max-diagnostics=none',
        ...fixtures.map((f) => f.path)
      ],
      { cwd: directory, encoding: 'utf8' }
    );
    assert.notEqual(run.status, null, `Biome didn't finish: ${run.error ?? run.signal}`);
    const { diagnostics } = JSON.parse(readFileSync(report, 'utf8')) as { diagnostics: Diagnostic[] };
    for (const diagnostic of diagnostics) {
      reported.set(diagnostic.location.path, [...(reported.get(diagnostic.location.path) ?? []), diagnostic]);
    }
  });

  after(() => rmSync(directory, { recursive: true, force: true }));

  it('has a fixture that reports and one that reports nothing for every plugin in biome.json', () => {
    const covered = (reports: boolean) =>
      [...new Set(fixtures.filter((f) => f.reports.length > 0 === reports).map((f) => f.plugin))].sort();
    assert.deepEqual(covered(true), [...plugins].sort());
    assert.deepEqual(covered(false), [...plugins].sort());
  });

  for (const { plugin, what, path, reports } of fixtures) {
    it(`${plugin} reports ${reports.length === 0 ? 'nothing' : reports.length} for ${what}`, () => {
      const diagnostics = reported.get(path) ?? [];
      // A fixture Biome can't parse would report nothing and pass as a good one.
      assert.deepEqual(
        diagnostics.filter((d) => d.category.startsWith('parse')).map((d) => d.message),
        []
      );
      assert.deepEqual(
        diagnostics.filter((d) => d.category === 'plugin').map((d) => d.message),
        reports
      );
    });
  }
});
