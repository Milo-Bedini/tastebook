import AxeBuilder from '@axe-core/playwright';
import type { APIRequestContext, BrowserContext, ConsoleMessage, Page } from '@playwright/test';
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

// Set by the preview checks workflow, whose specs run against a Vercel preview.
const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

// Gets past a preview's Vercel sign-in with the bypass cookie, which, unlike the bypass header sent with every request,
// stays on the preview: a cross-origin photo's CORS preflight refuses the header, and the photo never loads. The
// cookie is shared by the browser context the request belongs to.
const passPreviewSignIn = async (request: APIRequestContext, baseURL: string | undefined): Promise<void> => {
  if (bypassSecret && baseURL) {
    await request.get(baseURL, {
      headers: { 'x-vercel-protection-bypass': bypassSecret, 'x-vercel-set-bypass-cookie': 'true' }
    });
  }
};

const wasNavigated = (page: Page): boolean => page.url() !== 'about:blank';

const FAILED_LOAD = 'Failed to load resource: the server responded with a status of';

// allauth answers 401 to anyone not yet fully signed in, and 400 to a code asked for an address with no account,
// which the sign-in page then signs up (src/households/auth-api.ts, sign-in-api.ts). The browser logs each as a
// failed load, so these, by status and path, are the only ones a test needn't expect.
const ALLAUTH_AUTH_PATH = '/api/_allauth/browser/v1/auth';
const expectedFailedLoads = new Set([
  ...['/code/request', '/code/confirm', '/signup', '/email/verify', '/2fa/authenticate', '/session'].map(
    (path) => `401 ${ALLAUTH_AUTH_PATH}${path}`
  ),
  `400 ${ALLAUTH_AUTH_PATH}/code/request`
]);

// "…a status of 401 (Unauthorized)" over HTTP/1.1 locally, "…a status of 401 ()" over a preview's HTTP/2, which has no
// reason phrase; at the request's address.
const failedLoadStatus = (message: ConsoleMessage): string | undefined =>
  message.text().startsWith(FAILED_LOAD) ? message.text().slice(FAILED_LOAD.length).split(' ')[1] : undefined;

const isExpected = (message: ConsoleMessage): boolean => {
  const status = failedLoadStatus(message);
  const { url } = message.location();
  return status !== undefined && URL.canParse(url) && expectedFailedLoads.has(`${status} ${new URL(url).pathname}`);
};

// A failed load is reported by its status alone, so it reads the same locally and on a preview.
const loggedFailedLoad = (status: string, path: string): string => `${FAILED_LOAD} ${status} (at ${path})`;

// A request the app's server answered with an error, as consoleErrors.expect() takes it.
export const failedLoad = (status: 403 | 404, path: string): string => loggedFailedLoad(String(status), path);

const watchConsole = (context: BrowserContext, errors: string[], baseURL: string | undefined): void => {
  // The app's own addresses are given as paths, so a test reads the same locally and on a preview.
  const origin = baseURL === undefined ? undefined : new URL(baseURL).origin;
  const where = (url: string): string =>
    origin !== undefined && url.startsWith(`${origin}/`) ? url.slice(origin.length) : url;
  context.on('console', (message) => {
    if (message.type() === 'error' && !isExpected(message)) {
      // A failed load is placed at the request's address, anything else at the page that logged it.
      const status = failedLoadStatus(message);
      errors.push(
        status === undefined
          ? `${message.text()} (at ${where(message.page()?.url() ?? '')})`
          : loggedFailedLoad(status, where(message.location().url))
      );
    }
  });
  context.on('weberror', (webError) => {
    const { name, message } = webError.error();
    errors.push(`Uncaught ${name}: ${message} (at ${where(webError.page()?.url() ?? '')})`);
  });
};

// Each expected error matches one logged; what's left on either side fails the test.
const unmatched = (logged: string[], expected: string[]) =>
  logged.reduce(
    ({ unexpected, missing }, error) =>
      missing.includes(error)
        ? { unexpected, missing: missing.toSpliced(missing.indexOf(error), 1) }
        : { unexpected: [...unexpected, error], missing },
    { unexpected: [] as string[], missing: expected }
  );

type ConsoleErrors = {
  // An error the test's pages will log once, as a console error or an uncaught error; the test fails if they don't.
  expect: (error: string) => void;
  // Watches another context's pages too; the test's own and the seed's are watched already.
  watch: (context: BrowserContext) => void;
};

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

export const test = base.extend<{ accessibility: Accessibility; consoleErrors: ConsoleErrors; seed: Seeding }>({
  context: async ({ context, baseURL }, use) => {
    await passPreviewSignIn(context.request, baseURL);
    await use(context);
  },
  request: async ({ request, baseURL }, use) => {
    await passPreviewSignIn(request, baseURL);
    await use(request);
  },
  // A console error or an uncaught error on any page the test opened fails it, unless the test expected it.
  consoleErrors: [
    async ({ context, baseURL }, use, testInfo) => {
      const logged: string[] = [];
      const expected: string[] = [];
      const watch = (on: BrowserContext): void => watchConsole(on, logged, baseURL);
      watch(context);
      await use({ expect: (error) => expected.push(error), watch });

      // A test that already failed may not have reached the errors it expected.
      if (testInfo.status !== 'passed') {
        return;
      }
      expect(unmatched(logged, expected), 'Console errors and uncaught errors').toEqual({
        unexpected: [],
        missing: []
      });
    },
    { auto: true }
  ],
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
  seed: async ({ browser, request, baseURL, consoleErrors }, use, testInfo) => {
    if (!baseURL) {
      throw new Error('The seed needs a baseURL to set its session cookies on');
    }
    const contexts: BrowserContext[] = [];
    const seed: Seeding = async <const Key extends string>(households: SeedHouseholdOf<Key>[]) => {
      const { session_cookie, accounts } = await seedAccounts(request, { households });
      const opened = await Promise.all(
        Object.entries(accounts).map(async ([key, { session, ...account }]) => {
          const context = await browser.newContext({ baseURL, reducedMotion: 'reduce' });
          contexts.push(context);
          await passPreviewSignIn(context.request, baseURL);
          consoleErrors.watch(context);
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
