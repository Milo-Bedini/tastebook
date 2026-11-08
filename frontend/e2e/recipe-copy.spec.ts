import { expect, test } from './fixtures.ts';
import { soleCook } from './setups.ts';

// Chromium adds a space around the squiggle, which is inline-block.
const HEADING = /^Black bean +chilli$/;

test('a cook makes a private copy of a catalogue recipe, changes it, and the original stays as it was', async ({
  seed,
  accessibility
}) => {
  const { sam } = await seed(soleCook);

  await sam.page.goto('/recipes/black-bean-chilli');
  await expect(sam.page.getByText('Private', { exact: true })).toHaveCount(0);
  await sam.page.getByRole('button', { name: 'Make a copy' }).click();

  await expect(sam.page.getByText('Made a copy of Black bean chilli')).toBeVisible();
  await expect(sam.page).toHaveURL(/\/recipes\/black-bean-chilli-[a-z0-9]{6}$/);
  await expect(sam.page.getByRole('heading', { level: 1, name: HEADING })).toBeFocused();
  await expect(sam.page.getByText('Private', { exact: true })).toBeVisible();
  await expect(sam.page.getByText('Copied from Black bean chilli')).toBeVisible();
  await accessibility.check(sam.page);

  await sam.page.getByRole('link', { name: 'Edit recipe' }).click();
  await sam.page.getByRole('textbox', { name: 'Title' }).fill("Sam's chilli");
  await sam.page.getByRole('button', { name: 'Save changes' }).click();
  await expect(sam.page.getByRole('heading', { level: 1, name: /^Sam's +chilli$/ })).toBeVisible();

  await sam.page.getByRole('link', { name: 'Black bean chilli' }).click();
  await expect(sam.page).toHaveURL(/\/recipes\/black-bean-chilli$/);
  await expect(sam.page.getByRole('heading', { level: 1, name: HEADING })).toBeVisible();
  await expect(sam.page.getByText(/Copied from/)).toHaveCount(0);
});
