import { expect, test } from './fixtures.ts';
import { savedRecipes } from './setups.ts';
import { readSignInCode } from './test-accounts.ts';

test("deleting your account with a code from the email, after which Sam's dal is by a former member", async ({
  seed,
  accessibility
}) => {
  const { sam, jo } = await seed(savedRecipes);
  const { page } = sam;

  await page.goto('/account');
  await page.getByRole('button', { name: 'Delete account' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Delete your account?' });
  // Sam is the last in Sam's household, which keeps only Sam's two public recipes.
  await expect(dialog).toContainText(
    'The 2 public recipes in your household stay, credited to “a former member”, so links to them keep working.'
  );
  await expect(dialog).toContainText('Nightly backups keep a copy for up to 30 days.');
  await accessibility.check(page);

  await dialog.getByRole('button', { name: 'Send code' }).click();
  const code = dialog.getByRole('textbox', { name: 'Code' });
  await expect(code).toBeFocused();
  await expect(dialog).toContainText(`We sent a 6-digit code to ${sam.email}. It works for 10 minutes.`);
  await accessibility.check(page);
  await code.fill(await readSignInCode(page.request, sam.email));
  await dialog.getByRole('button', { name: 'Delete account' }).click();

  await expect(page.getByText('Your account is deleted.')).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  const session = await page.request.get('/api/account/');
  expect(await session.json()).toEqual({ account: null });
  await accessibility.check(page);

  await jo.page.goto('/lists/favourites');
  const dal = jo.page.getByRole('listitem').filter({ has: jo.page.getByRole('link', { name: "Sam's dal" }) });
  await expect(dal).toContainText('by a former member');
  await accessibility.check(jo.page);
});
