import { expect, test } from './fixtures.ts';
import { publishedRecipe } from './setups.ts';

// Chromium adds a space around the squiggle, which is inline-block.
const HEADING = /^Grandma's +curry$/;

test('the author makes their recipe public, everyone finds it credited, and it goes private again', async ({
  seed,
  accessibility
}) => {
  const { sam, ben, cy } = await seed(publishedRecipe);
  const address = `/recipes/${sam.recipes[0]?.slug}`;

  await sam.page.goto(address);
  const publicSwitch = sam.page.getByRole('switch', { name: 'Public' });
  await expect(publicSwitch).not.toBeChecked();
  await publicSwitch.click();
  const dialog = sam.page.getByRole('alertdialog', { name: 'Make this recipe public?' });
  await expect(dialog).toContainText(
    "Anyone can find Grandma's curry, credited “by Sam”, and only you will be able to edit it. You can make it private again."
  );
  await accessibility.check(sam.page);

  await dialog.getByRole('button', { name: 'Make public' }).click();

  await expect(sam.page.getByText("Grandma's curry is public")).toBeVisible();
  await expect(publicSwitch).toBeChecked();
  await expect(sam.page.getByText('by Sam')).toBeVisible();
  await accessibility.check(sam.page);

  await cy.page.goto('/recipes');
  const card = cy.page.locator(`a[href="${address}"]`);
  await expect(card).toHaveAccessibleDescription(/^by Sam /);
  await accessibility.check(cy.page);
  await card.click();
  await expect(cy.page.getByRole('heading', { level: 1, name: HEADING })).toBeVisible();
  await expect(cy.page.getByText('by Sam')).toBeVisible();
  await expect(cy.page.getByRole('switch', { name: 'Public' })).toHaveCount(0);
  await accessibility.check(cy.page);

  await ben.page.goto(address);
  await expect(ben.page.getByRole('heading', { level: 1, name: HEADING })).toBeVisible();
  await expect(ben.page.getByRole('link', { name: 'Edit recipe' })).toHaveCount(0);
  await expect(ben.page.getByRole('switch', { name: 'Public' })).toHaveCount(0);
  await accessibility.check(ben.page);

  await publicSwitch.click();

  await expect(sam.page.getByText("Grandma's curry is private again")).toBeVisible();
  await expect(publicSwitch).not.toBeChecked();
  await expect(sam.page.getByText('Private', { exact: true })).toBeVisible();

  await cy.page.reload();
  await expect(cy.page.getByRole('heading', { level: 1, name: 'Recipe not found' })).toBeVisible();
});
