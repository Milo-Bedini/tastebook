import type { Page } from '@playwright/test';

import { expect, test } from './fixtures.ts';
import { newTestAccountEmail, readSignInCode } from './test-accounts.ts';

type Accessibility = { check: () => Promise<void> };

const signInWithCode = async (page: Page, email: string): Promise<void> => {
  await page.getByRole('textbox', { name: 'Email address' }).fill(email);
  await page.getByRole('button', { name: 'Send code' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Check your email' })).toBeFocused();
  await page.getByRole('textbox', { name: 'Code' }).fill(await readSignInCode(page.request, email));
  await page.getByRole('button', { name: 'Sign in' }).click();
};

const signInFromTheBar = async (page: Page, email: string): Promise<void> => {
  await page.getByRole('banner').getByRole('link', { name: 'Sign in' }).click();
  await signInWithCode(page, email);
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

test('a member makes an invite link and cancels it', async ({ page, accessibility }) => {
  await signUpAs(page, 'Sam');
  await openHouseholdPage(page, 'Sam', accessibility);

  await page.getByRole('button', { name: 'Make invite link' }).click();
  const link = page.getByRole('textbox', { name: 'Invite link' });
  await expect(link).toHaveValue(/\/join\/[\w-]{43}$/);
  await accessibility.check();

  await page.getByRole('button', { name: 'Cancel link' }).click();
  const asked = page.getByRole('alertdialog', { name: 'Cancel this invite link?' });
  await expect(asked.getByRole('button', { name: 'Keep link' })).toBeFocused();
  await accessibility.check();
  await asked.getByRole('button', { name: 'Cancel link' }).click();

  await expect(page.getByText('Link cancelled')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Make invite link' })).toBeFocused();
  await expect(link).toHaveCount(0);
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

// Chromium adds a space around the squiggle, as in HOUSEHOLD_HEADING.
const JOIN_SAMS_HEADING = /^Join +Sam's household$/;

const ONLY_MEMBER = "You'll leave Ann's household. You're its only member, so it will be deleted.";

test('someone joins from an invite link, leaves, joins again and is removed', async ({
  page,
  browser,
  baseURL,
  extraHTTPHeaders,
  accessibility
}) => {
  // A second person needs a context of their own; it takes the config's address and headers, so it runs on previews.
  const samsContext = await browser.newContext({ baseURL, extraHTTPHeaders, reducedMotion: 'reduce' });
  const sam = await samsContext.newPage();
  await signUpAs(sam, 'Sam');
  await sam.goto('/household');
  await sam.getByRole('button', { name: 'Make invite link' }).click();
  const address = await sam.getByRole('textbox', { name: 'Invite link' }).inputValue();

  // Ann, signed out, learns only that the link works, then signs in through it as a new account.
  await page.goto(address);
  await expect(page.getByRole('heading', { level: 1, name: /^You've been +invited +to a household$/ })).toBeVisible();
  await accessibility.check();
  await page.getByRole('link', { name: 'Sign in to join' }).click();
  await signInWithCode(page, newTestAccountEmail());
  await page.getByRole('textbox', { name: 'Your name' }).fill('Ann');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(address);
  await expect(page.getByRole('heading', { level: 1, name: JOIN_SAMS_HEADING })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Members' }).getByRole('listitem')).toHaveText([/Sam$/]);
  await accessibility.check();

  await page.getByRole('button', { name: 'Join household' }).click();
  await expect(page.getByRole('alertdialog', { name: "Join Sam's household?" })).toHaveAccessibleDescription(
    ONLY_MEMBER
  );
  await accessibility.check();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Join household' }).click();
  await expect(page).toHaveURL(/\/household$/);
  await expect(page.getByRole('list', { name: 'Members' }).getByRole('listitem')).toHaveText([
    /Ann \(you\)$/,
    /^S ?Sam(Remove|$)/
  ]);

  await page.getByRole('button', { name: 'Leave household' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Leave household' }).click();
  await expect(page.getByRole('textbox', { name: 'Household name' })).toHaveValue("Ann's household");
  await expect(page.getByRole('list', { name: 'Members' }).getByRole('listitem')).toHaveText([/Ann \(you\)$/]);

  await page.goto(address);
  await page.getByRole('button', { name: 'Join household' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Join household' }).click();
  await expect(page.getByRole('list', { name: 'Members' }).getByRole('listitem')).toHaveText([
    /Ann \(you\)$/,
    /^S ?Sam(Remove|$)/
  ]);

  await sam.reload();
  await sam.getByRole('button', { name: 'Remove Ann' }).click();
  await sam.getByRole('alertdialog').getByRole('button', { name: 'Remove member' }).click();
  await expect(sam.getByRole('list', { name: 'Members' }).getByRole('listitem')).toHaveText([/Sam \(you\)$/]);
  await samsContext.close();

  await page.goto(address);
  await expect(page.getByRole('heading', { level: 1, name: 'This invite link was cancelled' })).toBeVisible();
  await accessibility.check();
});
