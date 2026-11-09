import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { expect, test } from './fixtures.ts';
import { busyDay, soleCook } from './setups.ts';
import { readSignInCode } from './test-accounts.ts';
import { totpCode } from './totp.ts';

const BACKEND = fileURLToPath(new URL('../../backend', import.meta.url));

test('the admin sends someone signed out to sign in', async ({ page }) => {
  await page.goto('/admin/');

  await expect(page).toHaveURL(/\/sign-in\?next=%2Fadmin%2F$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
});

test("the admin isn't there for an account that isn't staff", async ({ seed }) => {
  const { sam } = await seed(soleCook);

  // page.request shares the page's session without opening Django's 404 page in it for the fixture's axe scan.
  const response = await sam.page.request.get('/admin/');

  expect(response.status()).toBe(404);
});

test('a staff member sets up two-factor sign-in and then signs in with it', async ({ seed, accessibility }) => {
  test.skip(Boolean(process.env.PREVIEW_URL), 'make_staff needs the database');
  // Signing in again needs the app's next code: allauth takes each code once.
  test.setTimeout(90_000);
  const { email, page } = (await seed(soleCook)).sam;
  execFileSync('uv', ['run', 'python', 'manage.py', 'make_staff', email], {
    cwd: BACKEND,
    env: { ...process.env, DJANGO_DEBUG: 'true' }
  });

  await page.goto('/admin/');
  await expect(page.getByRole('heading', { level: 1, name: 'Set up two-factor sign-in' })).toBeVisible();
  await accessibility.check(page);
  const key = (await page.locator('#content-main code').textContent()) ?? '';
  const setUpWith = totpCode(key);
  await page.getByRole('textbox', { name: 'Code from the app' }).fill(setUpWith);
  await page.getByRole('button', { name: 'Turn on two-factor sign-in' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Save your recovery codes' })).toBeVisible();
  await expect(page.locator('#content-main ol li code')).toHaveCount(10);
  await accessibility.check(page);
  await page.getByRole('link', { name: 'Open the admin' }).click();

  await expect(page.getByText('Site administration')).toBeVisible();
  await accessibility.check(page);
  await page.getByRole('button', { name: 'Log out' }).click();

  await page.goto('/admin/');
  await page.getByRole('textbox', { name: 'Email address' }).fill(email);
  await page.getByRole('button', { name: 'Send code' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Check your email' })).toBeFocused();
  await page.getByRole('textbox', { name: 'Code' }).fill(await readSignInCode(page.request, email));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Enter your two-factor code' })).toBeFocused();
  await accessibility.check(page);
  await expect.poll(() => totpCode(key), { timeout: 35_000, intervals: [1_000] }).not.toBe(setUpWith);
  await page.getByRole('textbox', { name: 'Code' }).fill(totpCode(key));
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page).toHaveURL(/\/admin\/$/);
  await expect(page.getByText('Site administration')).toBeVisible();
});

test('staff remove a reported recipe, which its author then finds private', async ({ seed, accessibility }) => {
  test.skip(Boolean(process.env.PREVIEW_URL), 'make_staff needs the database');
  // The title is its own: the report hides it from every other spec that searches the database.
  const title = "Sam's reported traybake";
  const { sam, cy } = await seed([
    { members: [{ key: 'sam', name: 'Sam', recipes: [{ title, visibility: 'public', description: 'Sheet-pan.' }] }] },
    { members: [{ key: 'jo', name: 'Jo', reports: [title] }] },
    { members: [{ key: 'cy', name: 'Cy' }] }
  ]);
  execFileSync('uv', ['run', 'python', 'manage.py', 'make_staff', cy.email], {
    cwd: BACKEND,
    env: { ...process.env, DJANGO_DEBUG: 'true' }
  });
  const { page } = cy;
  await page.goto('/admin/');
  const key = (await page.locator('#content-main code').textContent()) ?? '';
  await page.getByRole('textbox', { name: 'Code from the app' }).fill(totpCode(key));
  await page.getByRole('button', { name: 'Turn on two-factor sign-in' }).click();
  await page.getByRole('link', { name: 'Open the admin' }).click();

  await page.getByRole('link', { name: 'Reported recipes' }).click();
  // Searched by its address, as earlier runs left recipes with its title in the database.
  const [recipe] = sam.recipes;
  await page.locator('#searchbar').fill(recipe?.slug ?? '');
  await page.getByRole('button', { name: 'Search' }).click();
  await accessibility.check(page);
  await page.getByRole('link', { name: title }).click();
  await expect(page.getByRole('cell', { name: 'Spam', exact: true })).toBeVisible();
  await accessibility.check(page);
  await page.goBack();
  await page.getByRole('checkbox', { name: `Select this object for an action - ${title}` }).check();
  await page
    .getByRole('combobox', { name: 'Action:' })
    .selectOption({ label: 'Remove: make private for good, and tell the author' });
  await page.getByRole('button', { name: 'Run' }).click();

  await expect(page.getByText(`Removed ${title}.`)).toBeVisible();
  await sam.page.goto(`/recipes/${recipe?.slug ?? ''}`);
  await expect(sam.page.getByRole('switch', { name: 'Public' })).not.toBeChecked();
});

test("an author's 4th recipe made public in a day waits until staff approve it", async ({
  page,
  seed,
  accessibility
}) => {
  test.skip(Boolean(process.env.PREVIEW_URL), 'make_staff needs the database');
  const { sam, cy } = await seed(busyDay);
  const traybake = sam.recipes[3];
  const address = `/recipes/${traybake?.slug ?? ''}`;

  await sam.page.goto(address);
  const publicSwitch = sam.page.getByRole('switch', { name: 'Public' });
  await publicSwitch.click();
  const dialog = sam.page.getByRole('alertdialog', { name: 'Make this recipe public?' });
  await expect(dialog).toContainText(
    "You've made several recipes public today, so staff will check Sam's busy-day traybake before anyone else can see it."
  );
  await dialog.getByRole('button', { name: 'Make public' }).click();

  await expect(sam.page.getByText("Sam's busy-day traybake is waiting for review")).toBeVisible();
  await expect(sam.page.getByText('Waiting for review', { exact: true })).toBeVisible();
  await expect(publicSwitch).toBeChecked();
  await accessibility.check(sam.page);
  await page.goto(address);
  await expect(page.getByRole('heading', { level: 1, name: 'Recipe not found' })).toBeVisible();

  execFileSync('uv', ['run', 'python', 'manage.py', 'make_staff', cy.email], {
    cwd: BACKEND,
    env: { ...process.env, DJANGO_DEBUG: 'true' }
  });
  const staff = cy.page;
  await staff.goto('/admin/');
  const key = (await staff.locator('#content-main code').textContent()) ?? '';
  await staff.getByRole('textbox', { name: 'Code from the app' }).fill(totpCode(key));
  await staff.getByRole('button', { name: 'Turn on two-factor sign-in' }).click();
  await staff.getByRole('link', { name: 'Open the admin' }).click();
  await staff.getByRole('link', { name: 'Recipes waiting for review' }).click();
  // Searched by its address, as earlier runs left recipes with its title in the database.
  await staff.locator('#searchbar').fill(traybake?.slug ?? '');
  await staff.getByRole('button', { name: 'Search' }).click();
  await accessibility.check(staff);
  await staff.getByRole('checkbox', { name: "Select this object for an action - Sam's busy-day traybake" }).check();
  await staff
    .getByRole('combobox', { name: 'Action:' })
    .selectOption({ label: 'Approve: make public, as its author asked' });
  await staff.getByRole('button', { name: 'Run' }).click();

  await expect(staff.getByText("Approved Sam's busy-day traybake.")).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: /traybake/ })).toBeVisible();
  await expect(page.getByText('by Sam')).toBeVisible();
});
