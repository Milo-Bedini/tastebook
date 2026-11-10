import { expect, failedLoad, test } from './fixtures.ts';
import { householdLists } from './setups.ts';

test('making a list for the household, which everyone in it sees and changes', async ({
  seed,
  accessibility,
  consoleErrors
}) => {
  const { milo, ann, jo } = await seed(householdLists);
  const { page } = milo;

  await page.goto('/lists');
  await expect(page.getByRole('region', { name: 'Just you' }).getByRole('link')).toHaveText([
    /^Favourites/,
    /^Weeknight dinners/
  ]);
  await expect(page.getByRole('region', { name: 'The Bedinis' }).getByRole('link')).toHaveText([/^Sunday roasts/]);
  await accessibility.check(page);

  await page.getByRole('button', { name: 'New list' }).click();
  const sheet = page.getByRole('dialog', { name: 'New list' });
  await sheet.getByRole('textbox', { name: 'Name' }).fill('Christmas');
  await sheet.getByRole('radio', { name: 'Household' }).check();
  await expect(sheet.getByText('Everyone in The Bedinis sees it and can change it.')).toBeVisible();
  await accessibility.check(page);
  await sheet.getByRole('button', { name: 'Make list' }).click();

  await expect(page).toHaveURL(/\/lists\/household\/christmas$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  await expect(page.getByText('Made Christmas')).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Nothing in Christmas yet' })).toBeVisible();
  await accessibility.check(page);

  // Ann sees it, renames it, and Milo finds it at its new address; Jo, outside the household, never does.
  await ann.page.goto('/lists/household/christmas');
  await ann.page.getByRole('button', { name: 'Rename' }).click();
  await ann.page.getByRole('textbox', { name: 'Name' }).fill('Christmas 2026');
  await ann.page.getByRole('button', { name: 'Save name' }).click();
  await expect(ann.page).toHaveURL(/\/lists\/household\/christmas-2026$/);
  await expect(ann.page.getByText('Renamed to Christmas 2026')).toBeVisible();

  await page.goto('/lists/household/christmas-2026');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Christmas\s+2026/);
  consoleErrors.expect(failedLoad(404, '/api/lists/household/christmas-2026/'));
  await jo.page.goto('/lists/household/christmas-2026');
  await expect(jo.page.getByRole('heading', { level: 1, name: 'This list has gone' })).toBeVisible();

  await page.getByRole('button', { name: 'Delete list' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Delete Christmas 2026?' });
  await expect(dialog).toContainText('It goes for everyone in The Bedinis.');
  await dialog.getByRole('button', { name: 'Delete list' }).click();
  await expect(page).toHaveURL(/\/lists$/);
  await expect(page.getByText('Deleted Christmas 2026')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  await expect(page.getByRole('region', { name: 'The Bedinis' }).getByRole('link')).toHaveText([/^Sunday roasts/]);
});

test('a list shows its recipes newest added first, and Remove takes one out until Undo', async ({
  seed,
  accessibility
}) => {
  const { milo } = await seed(householdLists);
  const { page } = milo;

  await page.goto('/lists/household/sunday-roasts');
  await expect(page.getByText('The Bedinis', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(['Pot roast', 'Toad in the hole']);
  await accessibility.check(page);

  await page.getByRole('button', { name: 'Remove Pot roast from Sunday roasts' }).click();
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(['Toad in the hole']);
  await expect(page.getByRole('button', { name: 'Remove Toad in the hole from Sunday roasts' })).toBeFocused();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(['Pot roast', 'Toad in the hole']);

  await page.getByRole('link', { name: 'Pot roast' }).click();
  await page.getByRole('link', { name: 'Sunday roasts' }).click();
  await expect(page).toHaveURL(/\/lists\/household\/sunday-roasts$/);
});

test('leaving the household keeps your own lists and leaves the household’s behind', async ({ seed }) => {
  const { milo } = await seed(householdLists);
  const { page } = milo;

  await page.goto('/household');
  await page.getByRole('button', { name: 'Leave household' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Leave household' }).click();
  await expect(page.getByText('You left The Bedinis')).toBeVisible();

  await page.goto('/lists');
  await expect(page.getByRole('region', { name: 'Just you' }).getByRole('link')).toHaveText([
    /^Favourites/,
    /^Weeknight dinners2 recipes/
  ]);
  await expect(page.getByRole('region', { name: "Milo's household" })).toContainText(
    "Lists you make for Milo's household show here, for everyone in it."
  );
});
