import type { Page } from '@playwright/test';

import { expect, test } from './fixtures.ts';
import { newTestAccountEmail, readSignInCode } from './test-accounts.ts';

type Accessibility = { check: () => Promise<void> };

// Both steps are scanned, since the fixture only scans the page a test ends on.
const signInFromTheBar = async (page: Page, accessibility: Accessibility, email: string): Promise<void> => {
  await page.getByRole('banner').getByRole('link', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
  await accessibility.check();
  await page.getByRole('textbox', { name: 'Email address' }).fill(email);
  await page.getByRole('button', { name: 'Send code' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Check your email' })).toBeFocused();
  await accessibility.check();
  await page.getByRole('textbox', { name: 'Code' }).fill(await readSignInCode(page.request, email));
  await page.getByRole('button', { name: 'Sign in' }).click();
};

// Chromium names the heading "What’s your name ?": the squiggle is inline-block, which adds a space around it.
const NAME_PAGE_HEADING = /^What’s your name ?\?$/;

const giveName = async (page: Page, accessibility: Accessibility, name: string): Promise<void> => {
  await expect(page.getByRole('heading', { level: 1, name: NAME_PAGE_HEADING })).toBeVisible();
  await accessibility.check();
  await page.getByRole('textbox', { name: 'Your name' }).fill(name);
  await page.getByRole('button', { name: 'Continue' }).click();
};

test('a new test account signs in from a recipe, gives its name, signs out and signs in again', async ({
  page,
  accessibility
}) => {
  const email = newTestAccountEmail();
  await page.goto('/recipes/baguette');
  await expect(page.getByRole('heading', { level: 1, name: 'Baguette' })).toBeVisible();

  await signInFromTheBar(page, accessibility, email);
  await giveName(page, accessibility, 'Sam');

  await expect(page).toHaveURL(/\/recipes\/baguette$/);
  const account = page.getByRole('banner').getByRole('button', { name: 'Account for Sam' });
  await expect(account).toBeVisible();

  await account.click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page.getByRole('banner').getByRole('link', { name: 'Sign in' })).toBeVisible();
  await expect(page).toHaveURL(/\/recipes\/baguette$/);

  const visited: string[] = [];
  page.on('framenavigated', (frame) => visited.push(frame.url()));
  await signInFromTheBar(page, accessibility, email);

  await expect(page).toHaveURL(/\/recipes\/baguette$/);
  await expect(account).toBeVisible();
  expect(visited.filter((url) => url.includes('/welcome'))).toEqual([]);
});

test("a new test account's name page under forced colours", async ({ page, accessibility }, testInfo) => {
  await page.emulateMedia({ forcedColors: 'active' });
  const email = newTestAccountEmail();
  await page.goto('/recipes/baguette');

  await signInFromTheBar(page, accessibility, email);

  const heading = page.getByRole('heading', { level: 1, name: NAME_PAGE_HEADING });
  await expect(heading).toBeVisible();
  const headingColour = await heading.evaluate((element) => getComputedStyle(element).color);
  const squiggleStroke = await heading.locator('svg path').evaluate((path) => getComputedStyle(path).stroke);
  expect(squiggleStroke).toBe(headingColour);
  await testInfo.attach('name page under forced colours', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png'
  });
});

// Only production has a Google client, so the page is told Google is offered and the real backend, with none, sends
// the browser back as it would after a failed sign-in at Google.
test('going to Google posts to the backend, which sends the browser back to the sign-in page when it fails', async ({
  page,
  accessibility
}) => {
  await page.route('**/api/_allauth/browser/v1/config', (route) =>
    route.fulfill({
      json: { status: 200, data: { socialaccount: { providers: [{ id: 'google', name: 'Google', flows: [] }] } } }
    })
  );
  await page.goto('/sign-in?next=%2Frecipes%2Fbaguette');
  await accessibility.check();

  await page.getByRole('button', { name: 'Continue with Google' }).click();

  await expect(page).toHaveURL(/\/sign-in\?error=/);
  await expect(page.getByRole('alert')).toContainText("Couldn't sign in with Google");
});
