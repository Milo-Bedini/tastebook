import { expect, failedLoad, test } from './fixtures.ts';
import { reportableRecipes } from './setups.ts';

test('a cook reports a public recipe, which only its author sees until staff review it', async ({
  page,
  seed,
  accessibility,
  consoleErrors
}) => {
  const { sam, milo } = await seed(reportableRecipes);
  const curry = `/recipes/${sam.recipes[0]?.slug}`;

  await milo.page.goto(curry);
  await milo.page.getByRole('button', { name: 'Report recipe' }).click();
  const sheet = milo.page.getByRole('dialog', { name: 'Report recipe' });
  await expect(sheet.getByRole('radio', { name: 'Spam' })).toBeFocused();
  await accessibility.check(milo.page);
  await sheet.getByRole('radio', { name: 'Copied without credit' }).check();
  await sheet.getByRole('textbox', { name: 'Note' }).fill("Word for word from Meera Sodha's Made in India.");
  // Milo's page asks for the recipe once more as it leaves it, since the report that hid it removed its query.
  consoleErrors.expect(failedLoad(404, `/api${curry}/`));
  await sheet.getByRole('button', { name: 'Send report' }).click();

  await expect(
    milo.page.getByText("Reported Grandma's Sunday curry. It's hidden while staff look at it.")
  ).toBeVisible();
  await expect(milo.page).toHaveURL(/\/recipes$/);
  await expect(milo.page.getByRole('heading', { level: 1, name: /cook +tonight/ })).toBeFocused();

  consoleErrors.expect(failedLoad(404, `/api${curry}/`));
  await page.goto(curry);
  await expect(page.getByRole('heading', { level: 1, name: 'Recipe not found' })).toBeVisible();

  await sam.page.goto(curry);
  await expect(sam.page.getByText('Hidden while a report is reviewed')).toBeVisible();
  const publicSwitch = sam.page.getByRole('switch', { name: 'Public' });
  await expect(publicSwitch).toBeChecked();
  await expect(publicSwitch).toHaveAttribute('aria-disabled', 'true');
  await accessibility.check(sam.page);

  await sam.page.goto(`/recipes?q=${encodeURIComponent("Grandma's Sunday curry")}`);
  // Earlier runs' curries share the title, so the card is found by its address.
  await expect(sam.page.locator(`a[href="${curry}"]`)).toHaveAccessibleDescription(/^Hidden for review/);
});

test('a report of a recipe staff restored leaves it up, and says it was sent', async ({ page, seed }) => {
  const { sam, milo } = await seed(reportableRecipes);
  const dal = `/recipes/${sam.recipes[1]?.slug}`;

  await milo.page.goto(dal);
  await milo.page.getByRole('button', { name: 'Report recipe' }).click();
  const sheet = milo.page.getByRole('dialog', { name: 'Report recipe' });
  await sheet.getByRole('radio', { name: 'Spam' }).check();
  await sheet.getByRole('button', { name: 'Send report' }).click();

  await expect(milo.page.getByText("Reported Sam's restored dal. Staff will look at it.")).toBeVisible();
  await expect(milo.page.getByRole('button', { name: 'Reported' })).toBeFocused();

  await page.goto(dal);
  await expect(page.getByRole('heading', { level: 1, name: /restored/ })).toBeVisible();
});
