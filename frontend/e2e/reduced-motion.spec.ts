import { expect, test } from './fixtures.ts';
import { soleCook } from './setups.ts';

// docs/design.md (Motion): prefers-reduced-motion turns transitions off, so a tab goes straight from one look to the
// other. A 0.01 ms transition left a label's inherited colour a frame behind its tab's background (light text on
// peach), which axe caught when a test's closing scan ran straight after a navigation.
test('under reduced motion a tab takes its new look in one frame when it becomes current', async ({ seed }) => {
  const { sam } = await seed(soleCook);
  const { page } = sam;
  const nav = page.getByRole('navigation', { name: 'Main' });

  await page.goto('/recipes');
  await expect(nav.getByRole('link', { name: 'Recipes' })).toHaveAttribute('aria-current', 'page');

  // Every frame, each tab's background and its label's colour, until the test reads them.
  await nav.evaluate((element) => {
    const seen = new Set<string>();
    const sample = (): void => {
      for (const link of element.querySelectorAll('a')) {
        const label = link.querySelector('span') ?? link;
        seen.add(`${getComputedStyle(link).backgroundColor} behind ${getComputedStyle(label).color}`);
      }
      requestAnimationFrame(sample);
    };
    Object.assign(window, { tabLooks: seen });
    sample();
  });

  await nav.getByRole('link', { name: 'Lists' }).click();
  await expect(nav.getByRole('link', { name: 'Lists' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your lists');

  const looks = await page.evaluate(() => [...(window as unknown as { tabLooks: Set<string> }).tabLooks]);
  // Ink on the bar or the hover's surface; the pastel's text on peach or the hover's peach.
  const designed = [
    'rgba(0, 0, 0, 0) behind rgb(255, 244, 234)',
    'rgb(42, 29, 71) behind rgb(255, 244, 234)',
    'rgb(255, 179, 138) behind rgb(42, 20, 64)',
    'oklab(0.858298 0.0562016 0.0664968) behind rgb(42, 20, 64)'
  ];
  expect(looks).toContain('rgb(255, 179, 138) behind rgb(42, 20, 64)');
  expect(looks.filter((look) => !designed.includes(look))).toEqual([]);
});
