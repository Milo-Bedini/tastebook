import { expect, failedLoad, test } from './fixtures.ts';

test('the home page links to the recipes page, which loads from the real API', async ({ page, accessibility }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Browse recipes' })).toBeVisible();
  await accessibility.check();

  await page.getByRole('link', { name: 'Browse recipes' }).click();

  await expect(page.getByRole('heading', { name: 'What shall we cook tonight?' })).toBeVisible();
  // Accepts either state, so a local database that already has recipes doesn't break the check.
  await expect(page.getByText('No recipes yet.').or(page.getByRole('list').first())).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('moves through the catalogue a page at a time through the real API', async ({
  page,
  accessibility,
  consoleErrors
}) => {
  await page.goto('/recipes');

  const count = page.getByRole('status').filter({ hasText: /recipes$/ });
  const pager = page.getByRole('navigation', { name: 'Pages' });
  await expect(count).toHaveText(/^1–24 of \d+ recipes$/);
  await expect(pager.getByText(/^Page 1 of \d+$/)).toBeVisible();
  await expect(pager.getByRole('link', { name: 'Previous' })).toHaveCount(0);
  await accessibility.check();

  await pager.getByRole('link', { name: 'Next' }).click();

  await expect(page).toHaveURL(/\/recipes\?page=2$/);
  await expect(page.getByRole('heading', { name: 'What shall we cook tonight?' })).toBeFocused();
  await expect(count).toHaveText(/^25–48 of \d+ recipes$/);
  await expect(pager.getByText(/^Page 2 of \d+$/)).toBeVisible();

  await page.getByRole('group', { name: 'Difficulty' }).getByRole('button', { name: 'Hard' }).click();

  await expect(page).toHaveURL(/\/recipes\?difficulty=hard$/);
  await expect(count).toHaveText(/^(1–24 of )?\d+ recipes?$/);

  // A page past the last answers 404, and the list shows the first in its place.
  consoleErrors.expect(failedLoad(404, '/api/recipes/?page=999'));
  await page.goto('/recipes?page=999');

  await expect(page).toHaveURL(/\/recipes$/);
  await expect(count).toHaveText(/^1–24 of \d+ recipes$/);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('a search with no matches says so through the real API', async ({ page }) => {
  await page.goto('/recipes');

  await page.getByRole('searchbox', { name: 'Search recipes' }).fill('xyzzy');

  await expect(page).toHaveURL(/\/recipes\?q=xyzzy$/);
  await expect(page.getByText('No recipes match “xyzzy”.')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('filters and clears them through the real API', async ({ page, accessibility }) => {
  await page.goto('/recipes?q=xyzzy');

  await page.getByRole('group', { name: 'Cuisine' }).getByRole('button', { name: 'Italian' }).click();
  await page.getByRole('group', { name: 'Total time' }).getByRole('button', { name: 'Up to 30 min' }).click();

  await expect(page).toHaveURL(/\/recipes\?q=xyzzy&cuisine=italian&max_total=30$/);
  await expect(page.getByText('No recipes match “xyzzy” with these filters.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove filter: Italian' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove filter: Total up to 30 min' })).toBeVisible();
  await accessibility.check();

  // The chip row's "Clear filters" comes first; the empty state's is the last.
  await page.getByRole('button', { name: 'Clear filters' }).last().click();

  await expect(page).toHaveURL(/\/recipes\?q=xyzzy$/);
  await expect(page.getByText('No recipes match “xyzzy”.')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

// The list shows a page at a time, so each check searches for its recipe first: what decides whether it's listed is
// the filters, not which page it falls on.
test("filters by diet and by an ingredient's synonym through the real API", async ({ page, accessibility }) => {
  await page.goto('/recipes?q=tortilla');
  const search = page.getByRole('searchbox', { name: 'Search recipes' });

  const diet = page.getByRole('group', { name: 'Diet' });
  await diet.getByRole('button', { name: 'Gluten-free' }).click();
  await diet.getByRole('button', { name: 'Dairy-free' }).click();

  await expect(page).toHaveURL(/\/recipes\?q=tortilla&diet=gluten_free&diet=dairy_free$/);
  await expect(page.getByRole('heading', { name: 'Spanish tortilla' })).toBeVisible();

  await search.fill('greek salad');

  await expect(page.getByText('No recipes match “greek salad” with these filters.')).toBeVisible();

  await page.getByRole('button', { name: 'Clear filters' }).first().click();
  await page.getByRole('combobox', { name: 'Exclude an ingredient' }).fill('plain yogurt');

  const yoghurt = page.getByRole('option', { name: 'natural yoghurt · also plain yogurt' });
  await expect(yoghurt).toBeVisible();
  await accessibility.check();

  await yoghurt.click();

  await expect(page).toHaveURL(/\/recipes\?q=greek\+salad&exclude_ingredient=natural-yoghurt$/);
  await expect(page.getByRole('button', { name: 'Remove filter: Without natural yoghurt' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Greek salad' })).toBeVisible();

  await search.fill('tikka masala');

  await expect(page.getByText('No recipes match “tikka masala” with these filters.')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('lists recipes with any or all of the included ingredients through the real API', async ({
  page,
  accessibility
}) => {
  await page.goto('/recipes?q=tortilla&include_ingredient=garlic&include_ingredient=onion');
  const search = page.getByRole('searchbox', { name: 'Search recipes' });
  await expect(page.getByRole('heading', { name: 'Spanish tortilla' })).toBeVisible();
  await search.fill('aglio');
  await expect(page.getByRole('heading', { name: 'Spaghetti aglio e olio' })).toBeVisible();

  await page.getByRole('group', { name: 'Included ingredients' }).getByRole('radio', { name: 'With all' }).check();

  await expect(page).toHaveURL(
    /\/recipes\?q=aglio&include_ingredient=garlic&include_ingredient=onion&include_match=all$/
  );
  await expect(page.getByText('No recipes match “aglio” with these filters.')).toBeVisible();
  await search.fill('spanish tortilla');
  await expect(page.getByText('No recipes match “spanish tortilla” with these filters.')).toBeVisible();
  await search.fill('tikka masala');
  await expect(page.getByRole('heading', { name: 'Chicken tikka masala' })).toBeVisible();
  await accessibility.check();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('tilts the filter chips in the laptop column but not in the phone sheet', async ({ page }) => {
  await page.goto('/recipes');
  const firstTotalTimeChip = page.getByRole('group', { name: 'Total time' }).getByRole('button').first();

  await expect(page.getByRole('complementary', { name: 'Filters' })).toBeVisible();
  // Tailwind's rotate utilities set the rotate property, not transform.
  expect(await firstTotalTimeChip.evaluate((chip) => getComputedStyle(chip).rotate)).toBe('-1.5deg');

  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole('button', { name: 'Filters', exact: true }).click();

  await expect(page.getByRole('dialog', { name: 'Filters' })).toBeVisible();
  expect(await firstTotalTimeChip.evaluate((chip) => getComputedStyle(chip).rotate)).toBe('none');
});
