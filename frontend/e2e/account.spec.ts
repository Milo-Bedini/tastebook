import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';

import type { components } from '../src/api/schema.js';
import { expect, test } from './fixtures.ts';
import { soleCook } from './setups.ts';

type Download = components['schemas']['Download'];

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

test('a cook downloads everything they have as one Tastebook file', async ({ seed, accessibility }) => {
  const { page } = (
    await seed([
      {
        members: [
          {
            key: 'sam',
            name: 'Sam',
            recipes: [{ title: "Sam's download pie", ingredient_lines: [{ amount: 1, ingredient: 'onion' }] }],
            saves: ['Baguette']
          }
        ]
      }
    ])
  ).sam;
  await page.goto('/recipes/baguette');
  await openAccountPage(page, 'Sam', accessibility);

  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download everything' }).click();
  const download = await downloading;
  const file = JSON.parse(await readFile(await download.path(), 'utf-8')) as Download;

  expect(download.suggestedFilename()).toMatch(/^tastebook-\d{4}-\d{2}-\d{2}\.json$/);
  expect([file.format, file.version, file.account.name, file.account.household_name]).toEqual([
    'tastebook',
    1,
    'Sam',
    "Sam's household"
  ]);
  expect(file.recipes.map(({ title, ingredient_lines }) => [title, ingredient_lines[0]?.ingredient])).toEqual([
    ["Sam's download pie", 'onion']
  ]);
  expect(
    file.lists.map(({ name, saved_recipes }) => [
      name,
      saved_recipes.map(({ address }) => address && new URL(address).pathname)
    ])
  ).toEqual([['Favourites', ['/recipes/baguette']]]);
});
