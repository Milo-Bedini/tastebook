import { expect, failedLoad, test } from './fixtures.ts';

test('the author deletes their recipe, and another member is not offered to', async ({
  seed,
  accessibility,
  consoleErrors
}) => {
  const { sam, ben } = await seed([
    {
      members: [
        {
          key: 'sam',
          name: 'Sam',
          recipes: [
            {
              title: 'Chana masala',
              cuisines: ['Indian'],
              ingredient_lines: [
                { amount: 1, ingredient: 'onion' },
                { amount: 2, ingredient: 'garlic', note: 'cloves' }
              ],
              steps: ['Fry the onion and garlic until soft.']
            }
          ]
        },
        { key: 'ben', name: 'Ben' }
      ]
    }
  ]);
  const address = `/recipes/${sam.recipes[0]?.slug}`;

  await ben.page.goto(address);
  await expect(ben.page.getByRole('link', { name: 'Edit recipe' })).toBeVisible();
  await expect(ben.page.getByRole('button', { name: 'Delete recipe' })).toHaveCount(0);

  await sam.page.goto(address);
  await sam.page.getByRole('button', { name: 'Delete recipe' }).click();
  const dialog = sam.page.getByRole('alertdialog', { name: 'Delete this recipe?' });
  await expect(dialog).toContainText(
    "Chana masala, its 2 ingredients and 1 step will be deleted for everyone in your household. You can't undo this."
  );
  await accessibility.check(sam.page);

  await dialog.getByRole('button', { name: 'Delete recipe' }).click();

  await expect(sam.page).toHaveURL(/\/recipes$/);
  await expect(sam.page.getByText('Deleted Chana masala')).toBeVisible();
  await expect(sam.page.getByText('No recipes yet.').or(sam.page.getByRole('list').first())).toBeVisible();
  // The catalogue has a Chana masala of its own, so the card is found by the deleted recipe's address.
  await expect(sam.page.locator(`a[href="${address}"]`)).toHaveCount(0);
  await accessibility.check(sam.page);

  consoleErrors.expect(failedLoad(404, `/api${address}/`));
  await ben.page.reload();
  await expect(ben.page.getByRole('heading', { level: 1, name: 'Recipe not found' })).toBeVisible();
});
