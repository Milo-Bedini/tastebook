import { expect, test } from './fixtures.ts';
import { soleCook, unfinishedRecipe } from './setups.ts';

// Chromium adds a space around the squiggle, which is inline-block.
const CURRY_HEADING = /^Grandma's +curry$/;

test('signed out, "Add a recipe" asks to sign in first', async ({ page }) => {
  await page.goto('/recipes');
  await page.getByRole('link', { name: 'Add a recipe' }).click();

  await expect(page).toHaveURL(/\/sign-in\?next=%2Frecipes%2Fnew$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
});

test('a cook adds a private recipe that only their household finds', async ({ page, seed, accessibility }) => {
  const { sam } = await seed(soleCook);
  await sam.page.goto('/recipes');
  await sam.page.getByRole('link', { name: 'Add a recipe' }).click();
  await expect(sam.page).toHaveURL(/\/recipes\/new$/);
  await expect(sam.page.getByRole('heading', { level: 1, name: /^Add a +recipe$/ })).toBeVisible();
  await accessibility.check(sam.page);

  await sam.page.getByRole('textbox', { name: 'Title' }).fill("Grandma's curry");
  await sam.page.getByRole('group', { name: 'Cuisines' }).getByRole('button', { name: 'Italian' }).click();
  await sam.page.getByRole('textbox', { name: 'Prep time' }).fill('20');
  await sam.page.getByRole('button', { name: 'Save recipe' }).click();

  await expect(sam.page).toHaveURL(/\/recipes\/grandmas-curry-[a-hjkmnp-z2-9]{6}$/);
  await expect(sam.page.getByRole('heading', { level: 1, name: CURRY_HEADING })).toBeVisible();
  await expect(sam.page.getByText('Private', { exact: true })).toBeVisible();
  await expect(sam.page.getByText('No method yet')).toBeVisible();
  await expect(sam.page.getByRole('term')).toHaveText(['Prep']);
  await accessibility.check(sam.page);
  const address = sam.page.url();

  await sam.page.getByRole('link', { name: 'All recipes' }).click();
  await sam.page.getByRole('searchbox', { name: 'Search recipes' }).fill('Grandma');
  // The specs share one database, where someone else's public recipe can have the same title.
  await expect(sam.page.getByRole('link', { name: "Grandma's curry", description: 'Private Italian' })).toBeVisible();
  await accessibility.check(sam.page);

  // Someone signed out neither opens nor finds it.
  await page.goto(address);
  await expect(page.getByRole('heading', { level: 1, name: 'Recipe not found' })).toBeVisible();
  await page.goto('/recipes?q=Grandma');
  await expect(page.getByRole('status').filter({ hasText: /^\d+ recipes?$/ })).toHaveCount(1);
  await expect(page.locator(`a[href="${new URL(address).pathname}"]`)).toHaveCount(0);
});

test('only the household sees what a private recipe is missing', async ({ seed, accessibility }) => {
  const { sam, ben, cy } = await seed(unfinishedRecipe);
  const address = `/recipes/${sam.recipes[0]?.slug}`;

  await ben.page.goto(address);
  await expect(ben.page.getByRole('heading', { level: 1, name: CURRY_HEADING })).toBeVisible();
  await expect(ben.page.getByText('Private', { exact: true })).toBeVisible();
  await expect(ben.page.getByText('No ingredients yet')).toBeVisible();
  await expect(ben.page.getByText('No method yet')).toBeVisible();
  await expect(ben.page.getByText('No cook time yet')).toBeVisible();
  await expect(ben.page.getByText('No servings yet')).toBeVisible();
  await accessibility.check(ben.page);

  await cy.page.goto(address);
  await expect(cy.page.getByRole('heading', { level: 1, name: 'Recipe not found' })).toBeVisible();
});
