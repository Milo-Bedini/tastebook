import { expect, test } from './fixtures.ts';
import { householdLists } from './setups.ts';

test('saving a recipe to any of your lists from its page, and seeing which hold it', async ({
  seed,
  accessibility
}) => {
  const { milo, ann } = await seed(householdLists);
  const { page } = milo;

  await page.goto('/recipes/chana-masala');
  const savedIn = page.getByText(/^Saved in /);
  await expect(savedIn).toHaveText('Saved in Weeknight dinners.');
  const heart = page.getByRole('button', { name: 'Favourite' });
  await expect(heart).toHaveAttribute('aria-pressed', 'false');

  await page.getByRole('button', { name: 'Save to list' }).click();
  const sheet = page.getByRole('dialog', { name: 'Save to a list' });
  // The index's groups and order: Favourites first, then the household's lists under its name.
  for (const [group, names] of [
    ['Just you', ['Favourites', 'Weeknight dinners']],
    ['The Bedinis', ['Sunday roasts']]
  ] as const) {
    const boxes = sheet.getByRole('group', { name: group }).getByRole('checkbox');
    await expect(boxes).toHaveCount(names.length);
    for (const [index, name] of names.entries()) {
      await expect(boxes.nth(index)).toHaveAccessibleName(name);
    }
  }
  await expect(sheet.getByRole('checkbox', { name: 'Favourites' })).toBeFocused();
  await expect(sheet.getByRole('checkbox', { name: 'Weeknight dinners' })).toBeChecked();
  await accessibility.check(page);

  await sheet.getByRole('checkbox', { name: 'Sunday roasts' }).click();
  await expect(sheet.getByRole('status')).toHaveText('Saved to Sunday roasts');
  await sheet.getByRole('checkbox', { name: 'Favourites' }).click();
  await expect(sheet.getByRole('status')).toHaveText('Saved to Favourites');
  await sheet.getByRole('checkbox', { name: 'Weeknight dinners' }).click();
  await expect(sheet.getByRole('status')).toHaveText('Removed from Weeknight dinners');
  await expect(sheet.getByRole('checkbox', { name: 'Sunday roasts' })).toHaveAccessibleDescription('3 recipes');
  await page.keyboard.press('Escape');

  await expect(page.getByRole('button', { name: 'Save to list' })).toBeFocused();
  await expect(savedIn).toHaveText('Saved in Favourites and Sunday roasts.');
  await expect(heart).toHaveAttribute('aria-pressed', 'true');
  await accessibility.check(page);

  // The household's list is everyone's: Ann finds it there.
  await ann.page.goto('/lists/household/sunday-roasts');
  await expect(ann.page.getByRole('heading', { level: 2 })).toHaveText([
    'Chana masala',
    'Pot roast',
    'Toad in the hole'
  ]);
  await page.goto('/lists/weeknight-dinners');
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(['Bibimbap']);
});

test('Save to list sends someone signed out to sign in, to come back to the sheet', async ({ page }) => {
  await page.goto('/recipes/chana-masala');

  await page.getByRole('button', { name: 'Save to list' }).click();

  await expect(page).toHaveURL(/\/sign-in\?next=%2Frecipes%2Fchana-masala%3Fsave-to-list%3Dopen$/);
});
