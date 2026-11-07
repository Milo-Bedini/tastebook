import type { Page, Request } from '@playwright/test';

import type { components } from '../src/api/schema.js';
import { expect, test } from './fixtures.ts';
import { soleCook } from './setups.ts';

type RecipePhoto = components['schemas']['RecipePhoto'];

// The store playwright.config.ts gives the local backend's made-up token. A preview's backend has the real store's
// token, so it refuses this one's addresses: these specs run against the local stack only.
const STORE = 'https://e2estore.public.blob.vercel-storage.com';
// Stored under an environment of its own, so removing it never asks the real store to delete anything.
const FOLDER = `${STORE}/recipes/test/AbCdEfGhIjKlMnOpQrStUv`;

const storedPhoto: RecipePhoto = {
  url: `${FOLDER}/1600.webp`,
  thumbnails: [330, 500, 960, 1280, 1600].map((width) => ({ width, url: `${FOLDER}/${width}.webp` })),
  credit: null
};

// One transparent pixel stands in for every stored photo.
const pixel = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);

test.skip(Boolean(process.env.PREVIEW_URL), "A preview's backend takes only its real store's photos");

// The photo store answers every upload with the same photo; each upload's request is kept to look at.
const routeStore = async (page: Page) => {
  const uploads: Request[] = [];
  await page.route('**/api/photos/', (route) => {
    uploads.push(route.request());
    return route.fulfill({ status: 201, json: storedPhoto });
  });
  await page.route(`${STORE}/**`, (route) => route.fulfill({ contentType: 'image/png', body: pixel }));
  return uploads;
};

// A camera's photo, 3,000 by 2,000 px, drawn in the browser.
const cameraPhoto = async (page: Page) =>
  Buffer.from(
    await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 3000;
      canvas.height = 2000;
      const context = canvas.getContext('2d');
      if (context !== null) {
        context.fillStyle = 'orange';
        context.fillRect(0, 0, 3000, 2000);
      }
      return canvas.toDataURL('image/jpeg', 0.8).split(',')[1] ?? '';
    }),
    'base64'
  );

// The width and height of the photo a multipart upload sent, decoded by the browser.
const sentSize = async (page: Page, upload: Request) => {
  const body = upload.postDataBuffer() ?? Buffer.alloc(0);
  const start = body.indexOf('\r\n\r\n') + 4;
  const end = body.lastIndexOf('\r\n--');
  const photo = body.subarray(start, end).toString('base64');
  return page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes]));
    return [bitmap.width, bitmap.height];
  }, photo);
};

test('a cook adds a photo, resized before it is sent, and later removes it', async ({ seed, accessibility }) => {
  const { sam } = await seed(soleCook);
  const uploads = await routeStore(sam.page);
  await sam.page.goto('/recipes/new');
  await sam.page.getByRole('textbox', { name: 'Title' }).fill("Grandma's curry");

  const field = sam.page.getByRole('group', { name: 'Photo' });
  await field.locator('input[type="file"]').setInputFiles({
    name: 'curry.jpg',
    mimeType: 'image/jpeg',
    buffer: await cameraPhoto(sam.page)
  });

  await expect(field.getByRole('img', { name: "The photo for Grandma's curry" })).toBeVisible();
  await expect(field.getByRole('status')).toHaveText('Photo uploaded');
  expect(uploads).toHaveLength(1);
  expect(await sentSize(sam.page, uploads[0] as Request)).toEqual([1600, 1067]);
  await accessibility.check(sam.page);

  await sam.page.getByRole('button', { name: 'Save recipe' }).click();

  const photo = sam.page.getByRole('img', { name: "Grandma's curry" });
  await expect(photo).toHaveAttribute('src', `${FOLDER}/330.webp`);
  await expect(sam.page.getByText(/Photo by/)).toHaveCount(0);
  await accessibility.check(sam.page);

  await sam.page.getByRole('link', { name: 'Edit recipe' }).click();
  await field.getByRole('button', { name: 'Remove photo' }).click();
  await expect(sam.page.getByText('Photo removed')).toBeVisible();
  await sam.page.getByRole('button', { name: 'Save changes' }).click();

  await expect(sam.page.getByRole('heading', { level: 1, name: /^Grandma's +curry$/ })).toBeVisible();
  await expect(sam.page.getByRole('img', { name: "Grandma's curry" })).toHaveCount(0);
});
