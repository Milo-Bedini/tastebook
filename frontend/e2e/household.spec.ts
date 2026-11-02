import type { Page } from '@playwright/test';

import { expect, test } from './fixtures.ts';
import { newTestAccountEmail, readSignInCode } from './test-accounts.ts';

type Accessibility = { check: () => Promise<void> };

const signInFromTheBar = async (page: Page, email: string): Promise<void> => {
  await page.getByRole('banner').getByRole('link', { name: 'Sign in' }).click();
  await page.getByRole('textbox', { name: 'Email address' }).fill(email);
  await page.getByRole('button', { name: 'Send code' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Check your email' })).toBeFocused();
  await page.getByRole('textbox', { name: 'Code' }).fill(await readSignInCode(page.request, email));
  await page.getByRole('button', { name: 'Sign in' }).click();
};

const signUpAs = async (page: Page, name: string): Promise<void> => {
  await page.goto('/recipes/baguette');
  await signInFromTheBar(page, newTestAccountEmail());
  await page.getByRole('textbox', { name: 'Your name' }).fill(name);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/recipes\/baguette$/);
};

// Chromium names the heading "Your  household": the squiggle is inline-block, which adds a space around it.
const HOUSEHOLD_HEADING = /^Your +household$/;

const openHouseholdPage = async (page: Page, name: string, accessibility: Accessibility): Promise<void> => {
  await page
    .getByRole('banner')
    .getByRole('button', { name: `Account for ${name}` })
    .click();
  await page.getByRole('menuitem', { name: 'Household' }).click();
  await expect(page.getByRole('heading', { level: 1, name: HOUSEHOLD_HEADING })).toBeVisible();
  await accessibility.check();
};

test('a new test account renames its household', async ({ page, accessibility }) => {
  await signUpAs(page, 'Sam');
  await openHouseholdPage(page, 'Sam', accessibility);
  await expect(page).toHaveURL(/\/household$/);

  const name = page.getByRole('textbox', { name: 'Household name' });
  await expect(name).toHaveValue("Sam's household");
  await expect(page.getByRole('list', { name: 'Members' }).getByRole('listitem')).toHaveText([/Sam \(you\)$/]);
  // The only member is offered neither Leave nor Remove.
  await expect(page.getByRole('button', { name: 'Leave household' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Remove/ })).toHaveCount(0);

  await name.fill('The Jones');
  await page.getByRole('button', { name: 'Save name' }).click();
  await expect(page.getByText('Household name saved')).toBeVisible();

  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Household name' })).toHaveValue('The Jones');
  await accessibility.check();
});

test("a new test account's household page under forced colours", async ({ page, accessibility }, testInfo) => {
  await page.emulateMedia({ forcedColors: 'active' });
  await signUpAs(page, 'Sam');
  await openHouseholdPage(page, 'Sam', accessibility);

  const heading = page.getByRole('heading', { level: 1, name: HOUSEHOLD_HEADING });
  const headingColour = await heading.evaluate((element) => getComputedStyle(element).color);
  const squiggleStroke = await heading.locator('svg path').evaluate((path) => getComputedStyle(path).stroke);
  expect(squiggleStroke).toBe(headingColour);
  await testInfo.attach('household page under forced colours', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png'
  });
});
