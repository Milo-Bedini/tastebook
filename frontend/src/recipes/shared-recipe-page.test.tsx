import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';

import type { components } from '../api/schema';
import { renderRoute } from '../test/render-route';
import { server } from '../test/server';

type SharedRecipe = components['schemas']['SharedRecipe'];
type CurrentAccount = components['schemas']['CurrentAccount'];
type IngredientLine = components['schemas']['IngredientLine'];

const line = (id: number, name: string, amount: number, unit: IngredientLine['unit']): IngredientLine => ({
  id,
  amount,
  amount_max: null,
  unit,
  ingredient: { slug: name.replaceAll(' ', '-'), name, grams_per_cup: null, awaiting_review: false },
  note: '',
  optional: false,
  original_text: ''
});

const curry: SharedRecipe = {
  id: 9,
  title: "Grandma's curry",
  description: "Sam's grandma's Sunday curry, slow and mild.",
  cuisines: [{ slug: 'indian', name: 'Indian' }],
  courses: [{ slug: 'main', name: 'Main' }],
  difficulty: 'easy',
  total_minutes: 60,
  prep_minutes: 20,
  cook_minutes: 40,
  extra_minutes: 0,
  extra_label: '',
  servings: 4,
  yield_amount: null,
  yield_unit: '',
  equipment: [],
  one_pot: false,
  source: '',
  source_url: '',
  original_source: '',
  original_source_url: '',
  photo: null,
  diet_tags: [],
  ingredient_lines: [line(1, 'chicken thighs', 800, 'g'), line(2, 'garam masala', 2, 'tsp')],
  ingredient_groups: [],
  steps: [
    { id: 1, text: 'Soften the onions in a little oil.' },
    { id: 2, text: 'Add the chicken and simmer for 40 minutes.' }
  ],
  diet_tag_conflicts: []
};

const TOKEN = 'q8Zr2LwT4mVxN3kP';

const answerAccount = (account: CurrentAccount['account']) =>
  server.use(http.get('/api/account/', () => HttpResponse.json<CurrentAccount>({ account })));

const answerLink = (answer: () => Response | Promise<Response>) => {
  const asked: string[] = [];
  server.use(
    http.get('/api/shared/:token/', ({ params }) => {
      asked.push(String(params.token));
      return answer();
    })
  );
  return asked;
};

const amounts = () =>
  within(screen.getByRole('region', { name: 'Ingredients' }))
    .getAllByRole('listitem')
    .map((item) => item.textContent?.replace(/\s+/g, ' ').trim());

const robots = () => document.querySelector('meta[name="robots"]')?.getAttribute('content');

describe('SharedRecipePage', () => {
  it('shows the recipe read-only, kept out of search engines, to someone signed out', async () => {
    answerAccount(null);
    const asked = answerLink(() => HttpResponse.json<SharedRecipe>(curry));
    renderRoute(`/shared/${TOKEN}`);

    expect(await screen.findByRole('heading', { level: 1, name: "Grandma's curry" })).toBeInTheDocument();
    expect(asked).toEqual([TOKEN]);
    expect(screen.getByText('Shared with you by link')).toBeInTheDocument();
    expect(screen.getByText("Sam's grandma's Sunday curry, slow and mild.")).toBeInTheDocument();
    expect(screen.getByText('1 hr · Easy · Indian · Main')).toBeInTheDocument();
    expect(amounts()).toEqual(['Chicken thighs 800 g', 'Garam masala 2 tsp']);
    expect(screen.getByText('Add the chicken and simmer for 40 minutes.')).toBeInTheDocument();
    expect(robots()).toBe('noindex');
    await waitFor(() => expect(document.title).toBe("Grandma's curry · Tastebook"));
    for (const control of ['Favourite', 'Save to list', 'Edit recipe', 'Make a copy', 'Delete recipe']) {
      expect(screen.queryByRole('button', { name: control })).not.toBeInTheDocument();
    }
    expect(screen.queryByRole('link', { name: 'Edit recipe' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'All recipes' })).not.toBeInTheDocument();
    expect(screen.queryByText('Private')).not.toBeInTheDocument();
  });

  it('scales the servings, which changes nothing stored', async () => {
    answerAccount(null);
    answerLink(() => HttpResponse.json<SharedRecipe>(curry));
    renderRoute(`/shared/${TOKEN}`);

    await userEvent.click(await screen.findByRole('button', { name: 'More servings' }));

    expect(screen.getByRole('status')).toHaveTextContent('Serves 5');
    expect(amounts()).toEqual(['Chicken thighs 1,000 g', 'Garam masala 2.5 tsp']);
  });

  it.each([
    ['signed in', { email: 'sam@example.com', name: 'Sam', unit_system: 'metric' as const }],
    ['signed in before giving a name', { email: 'jo@example.com', name: '', unit_system: 'metric' as const }]
  ])('opens %s, without going to the name page', async (_, account) => {
    answerAccount(account);
    answerLink(() => HttpResponse.json<SharedRecipe>(curry));
    const { router, queryClient } = renderRoute(`/shared/${TOKEN}`);

    await waitFor(() => expect(queryClient.isFetching()).toBe(0));

    expect(screen.getByRole('heading', { level: 1, name: "Grandma's curry" })).toBeInTheDocument();
    expect(screen.getByText('Shared with you by link')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Favourite' })).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/shared/${TOKEN}`);
  });

  it('shows a link that is off as a recipe not found, kept out of search engines', async () => {
    answerAccount(null);
    answerLink(() => new HttpResponse(null, { status: 404 }));
    renderRoute(`/shared/${TOKEN}`);

    expect(await screen.findByRole('heading', { level: 1, name: 'Recipe not found' })).toBeInTheDocument();
    expect(screen.getByText("This recipe doesn't exist or has been removed.")).toBeInTheDocument();
    expect(robots()).toBe('noindex');
    await waitFor(() => expect(document.title).toBe('Recipe not found · Tastebook'));
  });

  it('says so while it opens, and offers Try again when it can’t load', async () => {
    const state = { failing: true };
    answerAccount(null);
    answerLink(() =>
      state.failing ? new HttpResponse(null, { status: 500 }) : HttpResponse.json<SharedRecipe>(curry)
    );
    renderRoute(`/shared/${TOKEN}`);

    expect(screen.getByText('Opening the recipe…')).toBeInTheDocument();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Couldn't load the recipe");
    expect(alert).toHaveTextContent('Check your connection, then try again.');

    state.failing = false;
    await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('heading', { level: 1, name: "Grandma's curry" })).toBeInTheDocument();
  });
});
