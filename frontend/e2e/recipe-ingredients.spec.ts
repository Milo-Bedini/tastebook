import type { Page } from '@playwright/test';

import { expect, test } from './fixtures.ts';
import { soleCook } from './setups.ts';

// Chromium adds a space around the squiggle, which is inline-block.
const BEANS_HEADING = /^Chipotle +beans$/;

const sheet = (page: Page) => page.getByRole('dialog');

const done = async (page: Page) => {
  await sheet(page).getByRole('button', { name: 'Done' }).click();
  await expect(sheet(page)).toHaveCount(0);
};

// Picks from a picker, which opens the new line's sheet on Amount.
const pick = async (page: Page, picker: string, search: string, option: RegExp | string) => {
  await page.getByRole('combobox', { name: picker }).fill(search);
  await page.getByRole('option', { name: option, exact: typeof option === 'string' }).click();
  await expect(sheet(page).getByRole('textbox', { name: 'Amount' })).toBeFocused();
};

test('a cook writes a recipe’s ingredients in groups, adds one the list lacks, reorders and edits them', async ({
  seed,
  accessibility
}) => {
  const { sam } = await seed(soleCook);
  const { page } = sam;
  await page.goto('/recipes/new');
  await page.getByRole('textbox', { name: 'Title' }).fill('Chipotle beans');

  await pick(page, 'Add an ingredient', 'onio', 'onion');
  await sheet(page).getByRole('textbox', { name: 'Amount' }).fill('1');
  await done(page);

  // Found by its synonym, "canned black beans".
  await pick(page, 'Add an ingredient', 'canned black', /^black beans/);
  await sheet(page).getByRole('textbox', { name: 'Amount' }).fill('2');
  await sheet(page).getByRole('combobox', { name: 'Unit' }).selectOption('tin');
  await done(page);

  await page.getByRole('button', { name: 'Add a group' }).click();
  await expect(sheet(page).getByRole('textbox', { name: 'Group name' })).toBeFocused();
  await sheet(page).getByRole('textbox', { name: 'Group name' }).fill('To serve');
  await done(page);

  await pick(page, 'Add an ingredient to To serve', 'chipotle paste', 'Add “chipotle paste”');
  await expect(sheet(page)).toHaveAccessibleName('Chipotle paste');
  await sheet(page).getByRole('textbox', { name: 'Amount' }).fill('½');
  await sheet(page).getByRole('textbox', { name: 'Note' }).fill('or more to taste');
  await accessibility.check(page);
  await done(page);

  await expect(page.getByRole('button', { name: /^Chipotle paste/ })).toHaveAccessibleName(
    'Chipotle paste 0.5, or more to taste'
  );
  await accessibility.check(page);

  await page.getByRole('button', { name: 'Reorder' }).click();
  await page.getByRole('button', { name: 'Move black beans up' }).click();
  await expect(page.getByText('Moved black beans up.')).toBeVisible();
  await accessibility.check(page);
  await page.getByRole('button', { name: 'Done reordering' }).click();
  await page.getByRole('button', { name: 'Save recipe' }).click();

  await expect(page.getByRole('heading', { level: 1, name: BEANS_HEADING })).toBeVisible();
  const ingredients = page.getByRole('region', { name: 'Ingredients' });
  await expect(ingredients.getByRole('listitem')).toHaveText([
    'Black beans 2 tins',
    'Onion 1',
    'Chipotle paste, or more to taste 0.5'
  ]);
  await expect(ingredients.getByRole('heading', { level: 3 })).toHaveText(['To serve']);
  await expect(page.getByText("No diet tags until we've checked chipotle paste")).toBeVisible();
  await accessibility.check(page);

  await page.getByRole('link', { name: 'Edit recipe' }).click();
  await expect(page.getByRole('button', { name: /^(Black beans|Onion|Chipotle paste) / })).toHaveText([
    /^Black beans/,
    /^Onion/,
    /^Chipotle paste/
  ]);
  await page.getByRole('button', { name: 'Onion 1' }).click();
  await sheet(page).getByRole('button', { name: 'Remove onion' }).click();
  await expect(page.getByRole('combobox', { name: 'Add an ingredient', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Save changes' }).click();

  await expect(page.getByRole('heading', { level: 1, name: BEANS_HEADING })).toBeVisible();
  await expect(ingredients.getByRole('listitem')).toHaveText([
    'Black beans 2 tins',
    'Chipotle paste, or more to taste 0.5'
  ]);
});
