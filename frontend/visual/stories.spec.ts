import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { expect, test } from '@playwright/test';

import { boardByTitle } from '../src/dino/boards.ts';

type StoryIndex = {
  v: number;
  entries: Record<string, { id: string; title: string; name: string; type: 'story' | 'docs' }>;
};

declare global {
  interface Window {
    __STORYBOOK_PREVIEW__?: { currentRender?: { phase?: string } };
  }
}

const repoRoot = join(import.meta.dirname, '..', '..');
const indexPath = join(import.meta.dirname, '..', 'storybook-static', 'index.json');

if (!existsSync(indexPath)) {
  throw new Error('Build Storybook first: pnpm --filter frontend build-storybook');
}

const index: StoryIndex = JSON.parse(readFileSync(indexPath, 'utf8'));
const stories = Object.values(index.entries).filter((entry) => entry.type === 'story');

stories.map(({ id, title, name }) =>
  test(`${title} › ${name}`, async ({ page }, testInfo) => {
    const board = boardByTitle[title];
    if (board) {
      testInfo.annotations.push({ type: 'board', description: board });
    }

    await page.goto(`/iframe.html?id=${id}&viewMode=story`);
    // The phase reaches finished after play and the preview's afterEach; a story that errors never does.
    await page.waitForFunction(() => window.__STORYBOOK_PREVIEW__?.currentRender?.phase === 'finished');
    await page.evaluate(() => document.fonts.ready);
    // Play's clicks leave real focus on a control; Is Focus stories force their ring with a class instead.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    // Playwright 1.65 loses forced colours when a full-page shot grows the viewport to fit the story, so grow it first.
    const viewport = page.viewportSize();
    const content = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight
    }));
    if (viewport && (content.width > viewport.width || content.height > viewport.height)) {
      await page.setViewportSize({
        width: Math.max(viewport.width, content.width),
        height: Math.max(viewport.height, content.height)
      });
    }

    // The whole page, not the story root, so portalled dialogs and toasts are in the shot.
    await expect(page).toHaveScreenshot(`${id}.png`, { fullPage: true });
  })
);

test('every baseline has a story', () => {
  const storyIds = new Set(stories.map(({ id }) => id));
  // Each project keeps its own baselines (snapshotPathTemplate), so check the running project's.
  const baselinesDir = dirname(test.info().snapshotPath('any.png', { kind: 'screenshot' }));
  const baselines = existsSync(baselinesDir) ? readdirSync(baselinesDir).filter((file) => file.endsWith('.png')) : [];
  const orphans = baselines.map((file) => file.slice(0, -'.png'.length)).filter((id) => !storyIds.has(id));

  expect(orphans).toEqual([]);
});

test('every story title has a board image', () => {
  const titles = new Set(stories.map(({ title }) => title));
  const titlesWithoutBoard = [...titles].filter((title) => {
    const board = boardByTitle[title];
    return !board || !existsSync(join(repoRoot, board));
  });
  const boardsWithoutStory = Object.keys(boardByTitle).filter((title) => !titles.has(title));

  expect(titlesWithoutBoard).toEqual([]);
  expect(boardsWithoutStory).toEqual([]);
});
