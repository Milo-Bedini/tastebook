import { expect, test } from './fixtures.ts';

test('the sign-in page links to the privacy page, which opens signed out', async ({ page }) => {
  await page.goto('/sign-in');

  await page.getByRole('link', { name: 'How Tastebook uses your data' }).click();

  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Who handles it' })).toBeVisible();
  await expect(page).toHaveTitle('Privacy · Tastebook');
});

test.describe('at 320 px', () => {
  test.use({ viewport: { width: 320, height: 640 } });

  test('the privacy page reflows without scrolling sideways', async ({ page }) => {
    await page.goto('/privacy');
    await expect(page.getByRole('heading', { level: 2, name: 'No tracking' })).toBeVisible();

    const sidewaysScroll = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(sidewaysScroll).toBe(0);
  });
});
