import { expect, test } from './fixtures.ts';
import { newTestAccountEmail, readSignInCode } from './test-accounts.ts';

// Chromium adds a space around the squiggle, which is inline-block.
const CURRY_HEADING = /^Grandma's +curry$/;

test('a new account adds a private recipe that only its household finds', async ({
  page,
  browser,
  baseURL,
  extraHTTPHeaders,
  accessibility
}) => {
  // Signed out, "Add a recipe" goes through sign-in and the name page, then back to the form.
  await page.goto('/recipes');
  await page.getByRole('link', { name: 'Add a recipe' }).click();
  const email = newTestAccountEmail();
  await page.getByRole('textbox', { name: 'Email address' }).fill(email);
  await page.getByRole('button', { name: 'Send code' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Check your email' })).toBeFocused();
  await page.getByRole('textbox', { name: 'Code' }).fill(await readSignInCode(page.request, email));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('textbox', { name: 'Your name' }).fill('Sam');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/recipes\/new$/);
  await expect(page.getByRole('heading', { level: 1, name: /^Add a +recipe$/ })).toBeVisible();
  await accessibility.check();

  await page.getByRole('textbox', { name: 'Title' }).fill("Grandma's curry");
  await page.getByRole('group', { name: 'Cuisines' }).getByRole('button', { name: 'Italian' }).click();
  await page.getByRole('textbox', { name: 'Prep time' }).fill('20');
  await page.getByRole('button', { name: 'Save recipe' }).click();

  await expect(page).toHaveURL(/\/recipes\/grandmas-curry-[a-hjkmnp-z2-9]{6}$/);
  await expect(page.getByRole('heading', { level: 1, name: CURRY_HEADING })).toBeVisible();
  await expect(page.getByText('Private', { exact: true })).toBeVisible();
  await expect(page.getByText('No method yet')).toBeVisible();
  await expect(page.getByRole('term')).toHaveText(['Prep']);
  await accessibility.check();
  const address = page.url();

  await page.getByRole('link', { name: 'All recipes' }).click();
  await page.getByRole('searchbox', { name: 'Search recipes' }).fill('Grandma');
  const card = page.getByRole('link', { name: "Grandma's curry" });
  await expect(card).toBeVisible();
  await expect(card).toHaveAccessibleDescription('Private Italian');
  await accessibility.check();

  // Someone signed out, in a context of their own, neither opens nor finds it.
  const visitorsContext = await browser.newContext({ baseURL, extraHTTPHeaders, reducedMotion: 'reduce' });
  const visitor = await visitorsContext.newPage();
  await visitor.goto(address);
  await expect(visitor.getByRole('heading', { level: 1, name: 'Recipe not found' })).toBeVisible();
  await visitor.goto('/recipes?q=Grandma');
  await expect(visitor.getByText('No recipes match “Grandma”.')).toBeVisible();
  await expect(visitor.getByRole('link', { name: "Grandma's curry" })).toHaveCount(0);
  await visitorsContext.close();
});
