import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { expect, test } from './fixtures.ts';
import { soleCook } from './setups.ts';
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
