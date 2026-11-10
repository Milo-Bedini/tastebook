import { expect, failedLoad, test } from './fixtures.ts';
import { unfinishedRecipe } from './setups.ts';

// Chromium adds a space around the squiggle, which is inline-block.
const EDITED_HEADING = /^Grandma's +lamb +curry$/;

test('a member edits a recipe another member wrote, and only the household can', async ({
  seed,
  accessibility,
  consoleErrors
}) => {
  const { sam, ben, cy } = await seed(unfinishedRecipe);
  const address = `/recipes/${sam.recipes[0]?.slug}`;

  await ben.page.goto(address);
  await ben.page.getByRole('link', { name: 'Edit recipe' }).click();
  await expect(ben.page).toHaveURL(new RegExp(`${address}/edit$`));
  await expect(ben.page.getByRole('heading', { level: 1, name: /^Edit +recipe$/ })).toBeVisible();
  await expect(ben.page.getByRole('textbox', { name: 'Title' })).toHaveValue("Grandma's curry");
  await expect(
    ben.page.getByRole('group', { name: 'Cuisines' }).getByRole('button', { name: 'Indian' })
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(ben.page.getByRole('textbox', { name: 'Prep time' })).toHaveValue('20');
  await accessibility.check(ben.page);

  await ben.page.getByRole('textbox', { name: 'Title' }).fill("Grandma's lamb curry");
  await ben.page.getByRole('textbox', { name: 'Cook time' }).fill('40');
  await ben.page.getByRole('textbox', { name: 'How many people' }).fill('4');
  const method = ben.page.getByRole('region', { name: 'Method' });
  await method.getByRole('button', { name: 'Hob' }).click();
  await method.getByRole('textbox', { name: 'Step 1' }).fill('Fry the onion until golden.');
  await method.getByRole('button', { name: 'Add a step' }).click();
  await method.getByRole('textbox', { name: 'Step 2' }).fill('Add the lamb and simmer for 40 minutes.');
  await accessibility.check(ben.page);
  await ben.page.getByRole('button', { name: 'Save changes' }).click();

  await expect(ben.page).toHaveURL(new RegExp(`${address}$`));
  await expect(ben.page.getByRole('heading', { level: 1, name: EDITED_HEADING })).toBeVisible();
  await expect(ben.page.getByText('No cook time yet')).toHaveCount(0);
  await expect(ben.page.getByText('No method yet')).toHaveCount(0);
  // Each step's text follows its drawn number.
  await expect(ben.page.getByRole('region', { name: 'Method' }).getByRole('listitem')).toHaveText([
    '1Fry the onion until golden.',
    '2Add the lamb and simmer for 40 minutes.'
  ]);
  await expect(ben.page.getByText('No servings yet')).toHaveCount(0);
  await accessibility.check(ben.page);

  await sam.page.goto(address);
  await expect(sam.page.getByRole('heading', { level: 1, name: EDITED_HEADING })).toBeVisible();

  consoleErrors.expect(failedLoad('404 (Not Found)', `/api${address}/`));
  await cy.page.goto(`${address}/edit`);
  await expect(cy.page.getByRole('heading', { level: 1, name: 'Recipe not found' })).toBeVisible();
  await expect(cy.page.getByRole('textbox', { name: 'Title' })).toHaveCount(0);
});
