import type { Page } from '@playwright/test';

import { expect, test } from './fixtures.ts';
import { soleCook } from './setups.ts';

type Accessibility = { check: (on?: Page) => Promise<void> };

// Chromium names the heading "Your  account": the squiggle is inline-block, which adds a space around it.
const ACCOUNT_HEADING = /^Your +account$/;

const openAccountPage = async (page: Page, name: string, accessibility: Accessibility): Promise<void> => {
  await page
    .getByRole('banner')
    .getByRole('button', { name: `Account for ${name}` })
    .click();
  await page.getByRole('menuitem', { name: 'Account' }).click();
  await expect(page.getByRole('heading', { level: 1, name: ACCOUNT_HEADING })).toBeVisible();
  await accessibility.check(page);
};

test('a new test account changes its name and units, and recipes open in them', async ({ seed, accessibility }) => {
  const { page } = (await seed(soleCook)).sam;
  await page.goto('/recipes/baguette');
  await openAccountPage(page, 'Sam', accessibility);
  await expect(page).toHaveURL(/\/account$/);

  await page.getByRole('textbox', { name: 'Your name' }).fill('Sam Jones');
  await page.getByRole('button', { name: 'Save name' }).click();
  await expect(page.getByText('Name saved')).toBeVisible();
  await expect(page.getByRole('banner').getByRole('button', { name: 'Account for Sam Jones' })).toBeVisible();

  await page.getByRole('group', { name: 'Units' }).getByRole('radio', { name: 'US customary' }).click();
  await expect(page.getByText('Units saved')).toBeVisible();

  await page.goto('/recipes/baguette');
  await page.reload();
  const units = page.getByRole('group', { name: 'Units' });
  await expect(units.getByRole('radio', { name: 'US' })).toBeChecked();
  await expect(units.getByRole('radio', { name: 'Metric' })).not.toBeChecked();
});

test("a new test account's account page under forced colours", async ({ seed, accessibility }, testInfo) => {
  const { page } = (await seed(soleCook)).sam;
  await page.emulateMedia({ forcedColors: 'active' });
  await page.goto('/recipes/baguette');
  await openAccountPage(page, 'Sam', accessibility);

  const heading = page.getByRole('heading', { level: 1, name: ACCOUNT_HEADING });
  const headingColour = await heading.evaluate((element) => getComputedStyle(element).color);
  const squiggleStroke = await heading.locator('svg path').evaluate((path) => getComputedStyle(path).stroke);
  expect(squiggleStroke).toBe(headingColour);
  await testInfo.attach('account page under forced colours', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png'
  });
});
