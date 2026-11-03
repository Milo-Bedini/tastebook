import AxeBuilder from '@axe-core/playwright';
import type { BrowserContext, Page } from '@playwright/test';
import { test as base, expect } from '@playwright/test';

import type { components } from '../src/api/schema.js';
import { seedAccounts } from './test-accounts.ts';

// axe has no wcag22a tag: WCAG 2.2's new A criteria are all covered by the earlier levels' rules.
const wcag22aaTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

// Best-practice rules the tags leave out but WCAG 4.1.2 still asks for: a dialog needs a name.
const extraRules = { 'aria-dialog-name': { enabled: true } };

type Violation = Awaited<ReturnType<AxeBuilder['analyze']>>['violations'][number];

const describeViolation = ({ id, impact, help, nodes }: Violation): string =>
  `${id} (${impact ?? 'unknown impact'}): ${help}, at ${nodes.map(({ target }) => target.join(' ')).join('; ')}`;

const scan = async (page: Page): Promise<void> => {
  // Under forced colours the system theme sets text contrast, and Chromium reports the unforced
  // -webkit-text-fill-color that axe reads, so color-contrast fails text painted in CanvasText on Canvas.
  const isForcedColours = await page.evaluate(() => window.matchMedia('(forced-colors: active)').matches);
  const { violations } = await new AxeBuilder({ page })
    .options({ rules: extraRules })
    .withTags(wcag22aaTags)
    .disableRules(isForcedColours ? ['color-contrast'] : [])
    .analyze();
  expect(violations.map(describeViolation), `WCAG 2.2 A or AA violations on ${page.url()}`).toEqual([]);
};

const wasNavigated = (page: Page): boolean => page.url() !== 'about:blank';

type Accessibility = {
  // Scans the page as it is now, the test's own unless given another; call it on each page a spec visits before moving
  // on.
  check: (on?: Page) => Promise<void>;
};

type SeedMember = components['schemas']['SeedMember'];

// A household as the seed takes it, its members' keys kept as literals so the result is typed by them.
export type SeedHouseholdOf<Key extends string> = Omit<components['schemas']['SeedHousehold'], 'members'> & {
  members: (SeedMember & { key: Key })[];
};

export type SeededAccount = Omit<components['schemas']['SeededAccount'], 'session'> & { page: Page };

type Seeding = <const Key extends string>(households: SeedHouseholdOf<Key>[]) => Promise<Record<Key, SeededAccount>>;

export const test = base.extend<{ accessibility: Accessibility; seed: Seeding }>({
  accessibility: [
    async ({ page }, use, testInfo) => {
      await use({ check: (on = page) => scan(on) });

      // The page a test ends on is scanned for every test, so no spec can skip axe.
      if (testInfo.status === testInfo.expectedStatus && wasNavigated(page)) {
        await scan(page);
      }
    },
    { auto: true }
  ],
  // Each account opens signed in, in a browser context of its own; the test's own page stays signed out.
  seed: async ({ browser, request, baseURL, extraHTTPHeaders }, use, testInfo) => {
    if (!baseURL) {
      throw new Error('The seed needs a baseURL to set its session cookies on');
    }
    const contexts: BrowserContext[] = [];
    const seed: Seeding = async <const Key extends string>(households: SeedHouseholdOf<Key>[]) => {
      const { session_cookie, accounts } = await seedAccounts(request, { households });
      const opened = await Promise.all(
        Object.entries(accounts).map(async ([key, { session, ...account }]) => {
          const context = await browser.newContext({ baseURL, extraHTTPHeaders, reducedMotion: 'reduce' });
          contexts.push(context);
          // Given the address rather than a domain, so the cookie is secure on a preview's HTTPS.
          await context.addCookies([{ name: session_cookie, value: session, url: baseURL }]);
          return [key, { ...account, page: await context.newPage() }] as const;
        })
      );
      return Object.fromEntries(opened) as Record<Key, SeededAccount>;
    };

    await use(seed);

    // Each seeded page is scanned where its test left it, as the test's own page is.
    if (testInfo.status === testInfo.expectedStatus) {
      await Promise.all(
        contexts
          .flatMap((context) => context.pages())
          .filter(wasNavigated)
          .map(scan)
      );
    }
    await Promise.all(contexts.map((context) => context.close()));
  }
});

export { expect };
