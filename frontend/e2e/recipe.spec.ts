import { readFileSync } from 'node:fs';

import { expect, failedLoad, test } from './fixtures.ts';

type CatalogueRecipe = { slug: string; source: string; source_url?: string };

const catalogue: { recipes: CatalogueRecipe[] } = JSON.parse(
  readFileSync(new URL('../../backend/recipes/catalogue.json', import.meta.url), 'utf-8')
);

test('an unknown recipe shows "not found" through the real API', async ({ page, accessibility, consoleErrors }) => {
  consoleErrors.expect(failedLoad(404, '/api/recipes/no-such-recipe/'));
  await page.goto('/recipes/no-such-recipe');

  await expect(page.getByRole('heading', { name: 'Recipe not found' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await accessibility.check();

  await page.getByRole('link', { name: 'All recipes' }).click();

  await expect(page.getByRole('heading', { name: 'What shall we cook tonight?' })).toBeVisible();
});

test('changing the servings scales a catalogue recipe through the real API', async ({ page, accessibility }) => {
  await page.goto('/recipes/spanish-tortilla');

  const ingredients = page.getByRole('region', { name: 'Ingredients' });
  await expect(page.getByRole('status')).toHaveText('Serves 6');
  await accessibility.check();

  const more = page.getByRole('button', { name: 'More servings' });
  await more.click();
  await more.click();
  await more.click();

  await expect(page.getByRole('status')).toHaveText('Serves 9');
  await expect(ingredients.getByRole('listitem')).toHaveText([
    'Olive oil 225 ml',
    'Potatoes, floury, peeled and thinly sliced 900 g',
    'Onion, thinly sliced 1–2',
    'Eggs 9',
    'Salt 1.5 tsp'
  ]);
});

test('switching to US customary converts a catalogue recipe through the real API', async ({ page, accessibility }) => {
  await page.goto('/recipes/oat-and-raisin-cookies');

  const units = page.getByRole('group', { name: 'Units' });
  await expect(units.getByRole('radio', { name: 'Metric' })).toBeChecked();

  await units.getByRole('radio', { name: 'US' }).check();

  const lines = page.getByRole('region', { name: 'Ingredients' }).getByRole('listitem');
  await expect(lines).toHaveText([
    'Unsalted butter, softened 4.5 oz',
    'Light brown soft sugar 0.75 cup',
    'Golden syrup 2 tbsp',
    'Plain flour 1 cup',
    'Bicarbonate of soda 0.5 tsp',
    'Ground cinnamon (optional) 1 tsp',
    'Salt 1 pinch',
    'Porridge oats 1.75 cups',
    'Raisins 0.75 cup'
  ]);
  await expect(page.getByRole('region', { name: 'Method' }).getByRole('listitem').nth(3)).toContainText(
    'Heat the oven to 355°F (320°F fan)'
  );
  await accessibility.check();

  await page.getByRole('button', { name: 'Grams to cups' }).click();

  await expect(lines).toHaveText([
    'Unsalted butter, softened 4.5 oz',
    'Light brown soft sugar 5.25 oz',
    'Golden syrup 2 tbsp',
    'Plain flour 4.5 oz',
    'Bicarbonate of soda 0.5 tsp',
    'Ground cinnamon (optional) 1 tsp',
    'Salt 1 pinch',
    'Porridge oats 5.25 oz',
    'Raisins 3.5 oz'
  ]);
  await accessibility.check();
});

test("converting to grams reads a catalogue recipe's cups and millilitres as grams through the real API", async ({
  page,
  accessibility
}) => {
  await page.goto('/recipes/tabbouleh');

  const bulgur = page.getByRole('region', { name: 'Ingredients' }).getByRole('listitem').first();
  await expect(bulgur).toHaveText('Bulgur wheat, fine, or medium 75 g');
  await accessibility.check();

  await page.getByRole('button', { name: 'Cups to grams' }).click();

  await expect(bulgur).toHaveText('Bulgur wheat, fine, or medium 125 ml');
  await accessibility.check();
});

test('a Wikibooks recipe credits and links to its original page through the real API', async ({
  page,
  accessibility
}) => {
  const recipe = catalogue.recipes.find(({ source_url }) => source_url !== undefined && source_url !== '');
  if (recipe === undefined) {
    throw new Error('The catalogue has no Wikibooks recipe');
  }
  await page.goto(`/recipes/${recipe.slug}`);

  await expect(
    page.getByRole('link', {
      name: 'Adapted from the Wikibooks Cookbook (CC BY-SA 4.0), converted to metric, ingredients restructured',
      exact: true
    })
  ).toHaveAttribute('href', recipe.source_url ?? '');
  await accessibility.check();
});

test('on a laptop the ingredients stay in view while the method scrolls', async ({ page, accessibility }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  // The baguette's method is much longer than its ingredients, so the page scrolls past where they'd sit unstuck.
  await page.goto('/recipes/baguette');

  const lastStep = page.getByRole('region', { name: 'Method' }).getByRole('listitem').last();
  await lastStep.scrollIntoViewIfNeeded();

  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  const heading = await page.getByRole('heading', { level: 2, name: 'Ingredients' }).boundingBox();
  expect(heading?.y).toBeGreaterThanOrEqual(0);
  expect(heading?.y).toBeLessThan(800);
  await accessibility.check();
});
