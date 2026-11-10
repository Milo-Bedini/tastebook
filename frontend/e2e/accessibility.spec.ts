import { expect, test } from './fixtures.ts';

// Passes only when the fixture's closing scan waits for the fade to finish: scanned while it runs, the faded text fails
// color-contrast. The spinning paragraph never finishes, so a scan that waited for it would time out.
test('the closing scan waits for a page’s animations to finish, but not for one that never ends', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  await page.getByRole('main').evaluate((main) => {
    const fading = document.createElement('p');
    fading.textContent = 'Fading in';
    main.append(fading);
    fading.animate([{ opacity: 0.1 }, { opacity: 1 }], { duration: 1500 });

    const spinning = document.createElement('p');
    spinning.textContent = 'Spinning';
    main.append(spinning);
    spinning.animate([{ rotate: '0deg' }, { rotate: '360deg' }], {
      duration: 1000,
      iterations: Number.POSITIVE_INFINITY
    });
  });
  await expect(page.getByText('Fading in')).toBeVisible();
});
