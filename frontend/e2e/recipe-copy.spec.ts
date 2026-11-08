import { expect, test } from './fixtures.ts';
import { copiedRecipe, soleCook } from './setups.ts';

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
  await expect(
    sam.page.getByRole('link', { name: /^Adapted from the Wikibooks Cookbook \(CC BY-SA 4\.0\)/ })
  ).toBeVisible();
  await accessibility.check(sam.page);

  await sam.page.getByRole('link', { name: 'Edit recipe' }).click();
  await sam.page.getByRole('textbox', { name: 'Title' }).fill("Sam's chilli");
  await sam.page.getByRole('button', { name: 'Save changes' }).click();
  await expect(sam.page.getByRole('heading', { level: 1, name: /^Sam's +chilli$/ })).toBeVisible();
  await expect(
    sam.page.getByRole('link', { name: /^Adapted from the Wikibooks Cookbook \(CC BY-SA 4\.0\)/ })
  ).toBeVisible();

  await sam.page.getByRole('link', { name: 'Black bean chilli' }).click();
  await expect(sam.page).toHaveURL(/\/recipes\/black-bean-chilli$/);
  await expect(sam.page.getByRole('heading', { level: 1, name: HEADING })).toBeVisible();
  await expect(sam.page.getByText(/Copied from/)).toHaveCount(0);
});

test('a cook publishes their copy as an adaptation, credited until its original is no longer public', async ({
  seed,
  page,
  accessibility
}) => {
  const { sam, jo } = await seed(copiedRecipe);
  const original = `/recipes/${sam.recipes[0]?.slug}`;
  const adaptation = `/recipes/${jo.recipes[0]?.slug}`;

  await jo.page.goto(adaptation);
  await expect(jo.page.getByText("Copied from Grandma's curry")).toBeVisible();
  await jo.page.getByRole('switch', { name: 'Public' }).click();
  await jo.page.getByRole('alertdialog').getByRole('button', { name: 'Make public' }).click();
  await expect(jo.page.getByText("Adapted from Grandma's curry by Sam")).toBeVisible();

  await page.goto(adaptation);
  await expect(page.getByText('by Jo', { exact: true })).toBeVisible();
  await expect(page.getByText("Adapted from Grandma's curry by Sam")).toBeVisible();
  await accessibility.check(page);
  await page.getByRole('link', { name: "Grandma's curry" }).click();
  await expect(page).toHaveURL(new RegExp(`${original}$`));

  await sam.page.goto(original);
  await sam.page.getByRole('switch', { name: 'Public' }).click();
  await expect(sam.page.getByText("Grandma's curry is private again")).toBeVisible();

  await page.goto(adaptation);
  await expect(page.getByText("Adapted from a recipe that's no longer public")).toBeVisible();
  await expect(page.getByRole('link', { name: "Grandma's curry" })).toHaveCount(0);
});
