import type { Page } from '@playwright/test';

import type { components } from '../src/api/schema.js';
import { expect, test } from './fixtures.ts';

type Recipe = components['schemas']['Recipe'];
type RecipeSummary = components['schemas']['RecipeSummary'];

// A fresh database has no recipes until the catalogue loads, so these answer the API with a recipe whose long
// words and lists are the most likely to push the page sideways.
const recipe: Recipe = {
  id: 1,
  slug: 'slow-roasted-pork-shoulder',
  visibility: 'public',
  author: null,
  title: 'Slow-roasted pork shoulder with crackling, apple sauce and Yorkshire puddings',
  description: 'A Sunday roast for a crowd, with the crackling made the night before and the gravy from the pan.',
  cuisines: [
    { slug: 'british', name: 'British' },
    { slug: 'french', name: 'French' }
  ],
  adapted_from: null,
  is_copy: false,
  courses: [
    { slug: 'main', name: 'Main' },
    { slug: 'side', name: 'Side' }
  ],
  difficulty: 'hard',
  prep_minutes: 45,
  cook_minutes: 375,
  extra_minutes: 720,
  extra_label: 'dry-brining overnight in the fridge',
  total_minutes: 1140,
  photo: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/1/1a/Roast_pork.jpg',
    thumbnails: [330, 500, 960, 1280].map((width) => ({
      width,
      url: `https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Roast_pork.jpg/${width}px-Roast_pork.jpg`
    })),
    credit: {
      author: 'The Worshipful Company of Butchers of the City of London, photographed by its archivist',
      licence: 'CC BY-SA 4.0',
      source_url: 'https://commons.wikimedia.org/wiki/File:Roast_pork.jpg'
    }
  },
  diet_tags: ['dairy_free'],
  servings: null,
  yield_amount: 12,
  yield_unit: 'generous portions with leftovers',
  equipment: [
    { slug: 'oven', name: 'Oven' },
    { slug: 'hob', name: 'Hob' },
    { slug: 'food-processor', name: 'Food processor' },
    { slug: 'stand-mixer', name: 'Stand mixer' }
  ],
  one_pot: true,
  source: 'Adapted from https://en.wikibooks.org/wiki/Cookbook:Roast_Pork_Shoulder_with_Crackling (CC BY-SA 4.0)',
  source_url: 'https://en.wikibooks.org/wiki/Cookbook:Roast_Pork_Shoulder_with_Crackling',
  original_source: '',
  original_source_url: '',
  ingredient_lines: [
    {
      id: 1,
      amount: 2.5,
      amount_max: 3,
      unit: 'kg',
      ingredient: { slug: 'pork-shoulder', name: 'bone-in pork shoulder', grams_per_cup: null, awaiting_review: false },
      note: 'skin scored at 1 cm intervals, ask the butcher to do it if your knife is not sharp enough',
      optional: false,
      original_text: '5½–6½ lb bone-in pork shoulder, skin scored at ½ in intervals by the butcher'
    }
  ],
  ingredient_groups: [
    {
      id: 1,
      name: 'For the Yorkshire puddings, made while the pork rests under its foil',
      lines: [
        {
          id: 2,
          amount: 150,
          amount_max: null,
          unit: 'g',
          ingredient: { slug: 'plain-flour', name: 'plain flour', grams_per_cup: 125, awaiting_review: false },
          note: 'sifted',
          optional: false,
          original_text: ''
        },
        {
          id: 3,
          amount: null,
          amount_max: null,
          unit: 'handful',
          ingredient: { slug: 'thyme', name: 'thyme', grams_per_cup: null, awaiting_review: false },
          note: 'leaves picked, from https://en.wikibooks.org/wiki/Cookbook:Thyme',
          optional: true,
          original_text: ''
        }
      ]
    }
  ],
  steps: [
    { id: 1, text: 'The night before, rub the skin with salt and leave the pork uncovered in the fridge.' },
    { id: 2, text: 'Roast at 220°C for 30 minutes, then turn the oven down to 160°C for five and a half hours.' }
  ],
  diet_tag_conflicts: [],
  can_delete: false,
  can_edit: false,
  can_publish: false,
  save_count: null,
  can_share: false,
  share_token: null
};

const summary: RecipeSummary = {
  id: recipe.id,
  slug: recipe.slug,
  visibility: recipe.visibility,
  author: recipe.author,
  title: recipe.title,
  description: recipe.description,
  cuisines: recipe.cuisines,
  difficulty: recipe.difficulty,
  total_minutes: recipe.total_minutes,
  photo: recipe.photo,
  diet_tags: recipe.diet_tags
};

// One transparent pixel stands in for every Commons thumbnail, so the specs never reach Wikimedia.
const pixel = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);

const sidewaysScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.use({ viewport: { width: 375, height: 812 } });

test.beforeEach(async ({ page }) => {
  await page.route('https://upload.wikimedia.org/**', (route) =>
    route.fulfill({ contentType: 'image/png', body: pixel })
  );
});

// The list's query string changes with the filters, so the route matches on the path alone.
const routeRecipeList = (page: Page) =>
  page.route(
    (url) => url.pathname === '/api/recipes/',
    (route) => route.fulfill({ json: [summary] })
  );

test('the recipe list fits a 375 px phone screen without scrolling sideways', async ({ page }) => {
  await routeRecipeList(page);

  await page.goto('/recipes');

  await expect(page.getByText('19 hr · Hard · British, French')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Slow-roasted pork shoulder with crackling, apple sauce and Yorkshire puddings' })
  ).toBeVisible();
  expect(await sidewaysScroll(page)).toBe(0);
});

test('the recipe list with every filter on fits a 375 px phone screen', async ({ page }) => {
  await routeRecipeList(page);

  await page.goto(
    '/recipes?cuisine=british&course=main&difficulty=hard&max_total=60&max_prep=45&max_cook=30&one_pot=true'
  );
  // The chips behind the sheet are hidden from it, so they're checked before it opens.
  await expect(page.getByRole('button', { name: 'Remove filter: Total up to 60 min' })).toBeVisible();
  await page.getByRole('button', { name: 'Filters · 7' }).click();

  await expect(page.getByRole('group', { name: 'Cuisine' }).getByRole('button', { name: 'British' })).toBeVisible();
  await expect(page.getByText('19 hr · Hard · British, French')).toBeVisible();
  expect(await sidewaysScroll(page)).toBe(0);
});

test('the recipe list with diet and ingredient filters fits a 375 px phone screen', async ({ page }) => {
  await routeRecipeList(page);
  // The included ingredient isn't offered again, so a second one is left for the open picker to show.
  await page.route('**/api/ingredients/', (route) =>
    route.fulfill({
      json: [
        { slug: 'flat-leaf-parsley', name: 'flat-leaf parsley', synonyms: ['continental parsley', 'Italian parsley'] },
        { slug: 'natural-yoghurt', name: 'natural yoghurt', synonyms: ['plain yogurt'] }
      ]
    })
  );

  await page.goto('/recipes?diet=vegetarian&diet=gluten_free&include_ingredient=natural-yoghurt');
  await expect(page.getByRole('button', { name: 'Remove filter: With natural yoghurt' })).toBeVisible();
  await page.getByRole('button', { name: 'Filters · 3' }).click();
  await page.getByRole('combobox', { name: 'Exclude an ingredient' }).click();

  await expect(
    page.getByRole('option', { name: 'flat-leaf parsley · also continental parsley, Italian parsley' })
  ).toBeVisible();
  expect(await sidewaysScroll(page)).toBe(0);
});

test('a recipe page fits a 375 px phone screen without scrolling sideways', async ({ page }) => {
  await page.route(`**/api/recipes/${recipe.slug}/`, (route) => route.fulfill({ json: recipe }));

  await page.goto(`/recipes/${recipe.slug}`);

  await expect(page.getByText('generous portions with leftovers')).toBeVisible();
  await expect(page.getByText('Dairy-free')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Wikimedia Commons' })).toBeVisible();
  await expect(
    page.getByText('leaves picked, from https://en.wikibooks.org/wiki/Cookbook:Thyme', { exact: false })
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Method' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show original' })).toBeVisible();
  expect(await sidewaysScroll(page)).toBe(0);

  await page.getByRole('group', { name: 'Units' }).getByRole('radio', { name: 'US' }).check();

  await expect(page.getByRole('button', { name: 'Grams to cups' })).toBeVisible();
  expect(await sidewaysScroll(page)).toBe(0);
});

test('searches from the top bar on a 375 px phone screen', async ({ page }) => {
  await routeRecipeList(page);
  await page.goto('/');
  const searchBox = page.getByRole('searchbox', { name: 'Search recipes' });
  await expect(searchBox).toBeHidden();

  await page.getByRole('button', { name: 'Search recipes' }).click();

  await expect(searchBox).toBeVisible();
  await expect(searchBox).toBeFocused();
  await searchBox.fill('xyzzy');
  await expect(page).toHaveURL(/\/recipes\?q=xyzzy$/);
  await expect(page.getByText('19 hr · Hard · British, French')).toBeVisible();
  expect(await sidewaysScroll(page)).toBe(0);
});
