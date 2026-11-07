import { expect, test } from './fixtures.ts';
import { savedRecipes } from './setups.ts';

test('saving a recipe to Favourites from its page, and finding it on the Lists tab', async ({
  seed,
  accessibility
}) => {
  const { sam, jo } = await seed(savedRecipes);
  const { page } = jo;

  await page.goto(`/recipes/${sam.recipes[0]?.slug}`);
  const heart = page.getByRole('button', { name: 'Favourite', exact: true });
  await expect(heart).toHaveAttribute('aria-pressed', 'false');
  await heart.click();
  await expect(page.getByText('Saved to Favourites')).toBeVisible();
  await expect(heart).toHaveAttribute('aria-pressed', 'true');
  await accessibility.check(page);

  await page.getByRole('link', { name: 'Lists' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your lists');
  const favourites = page.getByRole('link', { name: /Favourites/ });
  await expect(favourites).toContainText('3 recipes');
  await expect(page.getByRole('link', { name: 'Lists' })).toHaveAttribute('aria-current', 'page');
  await accessibility.check(page);

  await favourites.click();
  await expect(page.getByRole('heading', { level: 2 })).toHaveText([
    "Sam's shakshuka",
    "Sam's dal",
    'Black bean chilli'
  ]);
  await accessibility.check(page);

  await page.getByRole('link', { name: "Sam's dal" }).click();
  await page.getByRole('link', { name: 'Favourites' }).click();
  await expect(page).toHaveURL(/\/lists\/favourites$/);
});

test('a saved recipe its author deletes stays as no longer available until it is unsaved', async ({
  seed,
  accessibility
}) => {
  const { sam, jo } = await seed(savedRecipes);

  await sam.page.goto(`/recipes/${sam.recipes[1]?.slug}`);
  await sam.page.getByRole('button', { name: 'Delete recipe' }).click();
  const dialog = sam.page.getByRole('alertdialog', { name: 'Delete this recipe?' });
  await expect(dialog).toContainText("1 person saved this; they'll see it's gone.");
  await dialog.getByRole('button', { name: 'Delete recipe' }).click();
  await expect(sam.page).toHaveURL(/\/recipes$/);

  await jo.page.goto('/lists/favourites');
  await expect(jo.page.getByRole('heading', { level: 2 })).toHaveText(["Sam's dal", 'Black bean chilli']);
  await expect(jo.page.getByText('Made private or deleted')).toBeVisible();
  await expect(jo.page.getByRole('link', { name: "Sam's dal" })).toHaveCount(0);
  await accessibility.check(jo.page);

  await jo.page.getByRole('button', { name: "Favourite Sam's dal" }).click();
  await expect(jo.page.getByRole('heading', { level: 2 })).toHaveText(['Black bean chilli']);
  await expect(jo.page.getByRole('button', { name: 'Favourite Black bean chilli' })).toBeFocused();
  await jo.page.getByRole('button', { name: 'Undo' }).click();
  await expect(jo.page.getByRole('heading', { level: 2 })).toHaveText(["Sam's dal", 'Black bean chilli']);
});

test('signed out, the heart goes through sign in, and there are no tabs or lists', async ({ page, seed }) => {
  const { sam } = await seed(savedRecipes);

  await page.goto(`/recipes/${sam.recipes[0]?.slug}`);
  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Favourite', exact: true }).click();

  await expect(page).toHaveURL(/\/sign-in\?next=/);
  await page.goto('/lists');
  await expect(page).toHaveURL(/\/sign-in\?next=%2Flists$/);
});
