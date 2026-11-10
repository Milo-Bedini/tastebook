import { expect, failedLoad, test } from './fixtures.ts';
import { soleCook } from './setups.ts';

const UNKNOWN_RECIPE = '/recipes/no-such-recipe';

// Passes only when the fixture reports each error as written here and leaves out allauth's 401 to a signed-out session.
test('the console errors a page logs are reported with where they came from, but allauth’s expected 401s', async ({
  page,
  consoleErrors
}) => {
  consoleErrors.expect(failedLoad(404, '/api/recipes/no-such-recipe/'));
  consoleErrors.expect(`A stray error (at ${UNKNOWN_RECIPE})`);
  consoleErrors.expect(`Uncaught Error: An uncaught error (at ${UNKNOWN_RECIPE})`);

  await page.goto(UNKNOWN_RECIPE);
  await expect(page.getByRole('heading', { level: 1, name: 'Recipe not found' })).toBeVisible();
  const session = await page.evaluate(async () => (await fetch('/api/_allauth/browser/v1/auth/session')).status);
  expect(session).toBe(401);
  await page.evaluate(() => console.error('A stray error'));
  await Promise.all([
    page.waitForEvent('pageerror'),
    page.evaluate(() => {
      setTimeout(() => {
        throw new Error('An uncaught error');
      });
    })
  ]);
});

test("a seeded account's page has its console errors reported too", async ({ seed, consoleErrors }) => {
  const { sam } = await seed(soleCook);
  consoleErrors.expect('A stray error (at /)');

  await sam.page.goto('/');
  await expect(sam.page.getByRole('heading', { level: 1 })).toBeVisible();
  await sam.page.evaluate(() => console.error('A stray error'));
});

test('a console error the test didn’t expect fails it', async ({ page }) => {
  test.fail();

  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.evaluate(() => console.error('A stray error'));
});

test('an error expected to maybe repeat passes however often it is logged, but must be logged', async ({
  page,
  consoleErrors
}) => {
  consoleErrors.expect('A repeated error (at /)', { mayRepeat: true });
  consoleErrors.expect('A single error (at /)', { mayRepeat: true });

  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.evaluate(() => {
    console.error('A repeated error');
    console.error('A repeated error');
    console.error('A single error');
  });
});

test('an error expected to maybe repeat that never comes fails the test', async ({ page, consoleErrors }) => {
  test.fail();
  consoleErrors.expect('A repeated error (at /)', { mayRepeat: true });

  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});
