import { expect, test } from './fixtures.ts';
import { publishedRecipe } from './setups.ts';

// Chromium adds a space around the squiggle, which is inline-block.
const HEADING = /^Grandma's +curry$/;

test('the author shares a private recipe by link, anyone opens it, and turning it off stops it', async ({
  page,
  seed,
  accessibility
}) => {
  const { sam, ben, cy } = await seed(publishedRecipe);
  await sam.page.goto(`/recipes/${sam.recipes[0]?.slug}`);
  const shareSwitch = sam.page.getByRole('switch', { name: 'Share by link' });
  await expect(shareSwitch).not.toBeChecked();

  await shareSwitch.click();

  const field = sam.page.getByRole('textbox', { name: 'Share link' });
  await expect(field).toHaveValue(/\/shared\/[\w-]{43}$/);
  await expect(shareSwitch).toBeChecked();
  await accessibility.check(sam.page);
  const address = new URL(await field.inputValue()).pathname;

  // Signed out: the recipe, read-only, and nothing of Sam's household.
  const answer = page.waitForResponse((response) => response.url().includes('/api/shared/'));
  await page.goto(address);
  expect((await answer).headers()['x-robots-tag']).toBe('noindex');
  await expect(page.getByRole('heading', { level: 1, name: HEADING })).toBeVisible();
  await expect(page.getByText('Shared with you by link')).toBeVisible();
  await expect(page.getByText('Fry the onion and garlic until soft.')).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  await expect(page).toHaveTitle("Grandma's curry · Tastebook");
  await expect(page.getByRole('button', { name: 'Favourite' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save to list' })).toHaveCount(0);
  await expect(page.getByText('Sam', { exact: true })).toHaveCount(0);
  await accessibility.check(page);

  // Signed in, in another household and in Sam's own: the same page.
  for (const viewer of [cy, ben]) {
    await viewer.page.goto(address);
    await expect(viewer.page.getByText('Shared with you by link')).toBeVisible();
    await expect(viewer.page.getByRole('button', { name: 'Favourite' })).toHaveCount(0);
  }

  await shareSwitch.click();
  const dialog = sam.page.getByRole('alertdialog', { name: 'Turn off the share link?' });
  await accessibility.check(sam.page);
  await dialog.getByRole('button', { name: 'Turn off link' }).click();

  await expect(sam.page.getByText('Share link turned off')).toBeVisible();
  await expect(shareSwitch).not.toBeChecked();
  await expect(field).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Recipe not found' })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
});
