import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { components } from '../api/schema';
import { toast } from '../dino';
import { renderRoute } from '../test/render-route';
import { server } from '../test/server';

type CurrentAccount = components['schemas']['CurrentAccount'];
type Recipe = components['schemas']['Recipe'];
type RecipeChanges = components['schemas']['PatchedRecipeChanges'];

const RECIPE = '/api/recipes/flatbreads-k7m2qx/';
const EDIT = '/recipes/flatbreads-k7m2qx/edit';
const SIGN_IN_SEARCH = '?next=%2Frecipes%2Fflatbreads-k7m2qx%2Fedit';
const NOT_SAVED = "Couldn't save the recipe. Check your connection and try again.";

const signedIn: CurrentAccount = { account: { email: 'ben@example.com', name: 'Ben', unit_system: 'metric' } };

const flatbreads: Recipe = {
  id: 41,
  slug: 'flatbreads-k7m2qx',
  visibility: 'private',
  title: 'Flatbreads',
  description: 'Soft and blistered.',
  cuisines: [{ slug: 'italian', name: 'Italian' }],
  courses: [{ slug: 'main', name: 'Main' }],
  difficulty: 'medium',
  prep_minutes: 15,
  cook_minutes: 30,
  extra_minutes: 60,
  extra_label: 'marinating',
  total_minutes: 105,
  photo: null,
  diet_tags: [],
  servings: null,
  yield_amount: 12,
  yield_unit: 'flatbreads',
  equipment: [],
  one_pot: true,
  source: "Nonna's notebook",
  source_url: 'https://example.com/flatbreads',
  ingredient_lines: [],
  ingredient_groups: [],
  steps: [],
  diet_tag_conflicts: [],
  can_delete: false
};

// Signed in, the recipe answered as `recipe`, and each PATCH body recorded and answered by `respond`, which by
// default saves what was sent.
const answerEditing = (
  recipe: Recipe = flatbreads,
  respond: (changes: RecipeChanges) => Response = (changes) =>
    HttpResponse.json<Recipe>({
      ...recipe,
      ...changes,
      cuisines: recipe.cuisines,
      courses: recipe.courses,
      ingredient_lines: recipe.ingredient_lines,
      ingredient_groups: recipe.ingredient_groups
    })
) => {
  const sent: RecipeChanges[] = [];
  server.use(
    http.get('/api/account/', () => HttpResponse.json<CurrentAccount>(signedIn)),
    http.get(RECIPE, () => HttpResponse.json<Recipe>(recipe)),
    http.patch(RECIPE, async ({ request }) => {
      const changes = (await request.json()) as RecipeChanges;
      sent.push(changes);
      return respond(changes);
    })
  );
  return sent;
};

const textbox = (name: string) => screen.getByRole('textbox', { name });

const openForm = async () => {
  const rendered = renderRoute(EDIT);
  await screen.findByRole('heading', { level: 1, name: 'Edit recipe' });
  return rendered;
};

const retitle = async (title: string) => {
  await userEvent.clear(textbox('Title'));
  await userEvent.type(textbox('Title'), title);
};

const save = () => userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

describe('EditRecipePage', () => {
  beforeEach(() => {
    // biome-ignore lint/suspicious/noDocumentCookie: Django's account request sets this cookie; jsdom has no Cookie Store
    document.cookie = 'csrftoken=abc';
  });

  // Sonner keeps its toasts outside React, so one test's toast would still show in the next.
  afterEach(() => {
    toast.dismiss();
  });

  it('opens with every detail of the recipe filled in', async () => {
    answerEditing();
    await openForm();

    expect(textbox('Title')).toHaveValue('Flatbreads');
    expect(textbox('Description')).toHaveValue('Soft and blistered.');
    expect(await screen.findByRole('button', { name: 'Italian' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'French' })).toHaveAttribute('aria-pressed', 'false');
    expect(await screen.findByRole('button', { name: 'Main' })).toHaveAttribute('aria-pressed', 'true');
    expect(
      within(screen.getByRole('group', { name: 'Difficulty' })).getByRole('radio', { name: 'Medium' })
    ).toBeChecked();
    expect(textbox('Prep time')).toHaveValue('15');
    expect(textbox('Cook time')).toHaveValue('30');
    expect(textbox('Extra time')).toHaveValue('60');
    expect(textbox("What it's for")).toHaveValue('marinating');
    expect(screen.getByRole('radio', { name: 'Makes' })).toBeChecked();
    expect(textbox('How many')).toHaveValue('12');
    expect(textbox('What it makes')).toHaveValue('flatbreads');
    expect(screen.getByRole('switch', { name: 'One-pot' })).toBeChecked();
    expect(textbox('Source credit')).toHaveValue("Nonna's notebook");
    expect(textbox('Source address')).toHaveValue('https://example.com/flatbreads');
    expect(document.title).toBe('Edit Flatbreads · Tastebook');
  });

  it('saves every detail the form has and opens the recipe at the same address', async () => {
    const sent = answerEditing();
    const { router } = await openForm();

    await retitle("Za'atar flatbreads");
    await save();

    expect(await screen.findByRole('heading', { level: 1, name: "Za'atar flatbreads" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/recipes/flatbreads-k7m2qx');
    expect(sent).toEqual([
      {
        title: "Za'atar flatbreads",
        description: 'Soft and blistered.',
        cuisines: ['italian'],
        courses: ['main'],
        difficulty: 'medium',
        prep_minutes: 15,
        cook_minutes: 30,
        extra_minutes: 60,
        extra_label: 'marinating',
        servings: null,
        yield_amount: 12,
        yield_unit: 'flatbreads',
        one_pot: true,
        source: "Nonna's notebook",
        source_url: 'https://example.com/flatbreads',
        ingredient_lines: [],
        ingredient_groups: []
      }
    ]);
  });

  it('sends a cleared time as none, and what was never given as empty', async () => {
    const sent = answerEditing({
      ...flatbreads,
      description: '',
      cuisines: [],
      courses: [],
      difficulty: '',
      prep_minutes: 20,
      cook_minutes: null,
      extra_minutes: 0,
      extra_label: '',
      servings: 4,
      yield_amount: null,
      yield_unit: '',
      one_pot: false,
      source: '',
      source_url: ''
    });
    await openForm();

    await userEvent.clear(textbox('Prep time'));
    await save();

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({
      title: 'Flatbreads',
      description: '',
      cuisines: [],
      courses: [],
      difficulty: '',
      prep_minutes: null,
      cook_minutes: null,
      extra_minutes: 0,
      extra_label: '',
      servings: 4,
      yield_amount: null,
      yield_unit: '',
      one_pot: false,
      source: '',
      source_url: '',
      ingredient_lines: [],
      ingredient_groups: []
    });
  });

  it('refuses an empty title before sending', async () => {
    const sent = answerEditing();
    await openForm();

    await userEvent.clear(textbox('Title'));
    await save();

    expect(textbox('Title')).toHaveAccessibleDescription("Give the recipe a title, like Grandma's curry.");
    expect(textbox('Title')).toHaveFocus();
    expect(sent).toEqual([]);
  });

  it('says "Saving…" and is busy while the changes save', async () => {
    const gate = { release: () => {} };
    const released = new Promise<void>((resolve) => {
      gate.release = resolve;
    });
    answerEditing();
    server.use(
      http.patch(RECIPE, async () => {
        await released;
        return HttpResponse.json<Recipe>(flatbreads);
      })
    );
    await openForm();

    await save();

    const saving = await screen.findByRole('button', { name: 'Saving…' });
    expect(saving).toHaveAttribute('aria-busy', 'true');

    gate.release();
    expect(await screen.findByRole('heading', { level: 1, name: 'Flatbreads' })).toBeInTheDocument();
  });

  it("shows Tastebook's refusal of the title under the title", async () => {
    answerEditing(flatbreads, () =>
      HttpResponse.json({ title: ["Give the recipe a title, like Grandma's curry."] }, { status: 400 })
    );
    await openForm();

    await save();

    await waitFor(() =>
      expect(textbox('Title')).toHaveAccessibleDescription("Give the recipe a title, like Grandma's curry.")
    );
    expect(textbox('Title')).toHaveFocus();
  });

  it('shows a refusal that names no field in a banner above Save', async () => {
    answerEditing(flatbreads, () =>
      HttpResponse.json({ non_field_errors: ['Give servings or a yield with its unit, not both.'] }, { status: 400 })
    );
    await openForm();

    await save();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't save the recipeGive servings or a yield with its unit, not both."
    );
  });

  it('sends you to sign in, and back to the form after, when Tastebook says you are signed out on Save', async () => {
    const state = { signedOut: false };
    answerEditing(flatbreads, () => {
      state.signedOut = true;
      return new HttpResponse(null, { status: 403 });
    });
    server.use(
      http.get('/api/account/', () => HttpResponse.json<CurrentAccount>(state.signedOut ? { account: null } : signedIn))
    );
    const { router } = await openForm();

    await save();

    await waitFor(() => expect(router.state.location.pathname).toBe('/sign-in'));
    expect(router.state.location.search).toBe(SIGN_IN_SEARCH);
  });

  it('says the changes were not saved when Save is refused and the session still says signed in', async () => {
    answerEditing(flatbreads, () => new HttpResponse(null, { status: 403 }));
    await openForm();

    await retitle('Lamb flatbreads');
    await save();

    expect(await screen.findByText(NOT_SAVED)).toBeInTheDocument();
    expect(textbox('Title')).toHaveValue('Lamb flatbreads');
  });

  it('says the recipe is not found when it went before Save', async () => {
    answerEditing(flatbreads, () => new HttpResponse(null, { status: 404 }));
    await openForm();

    await save();

    expect(await screen.findByRole('heading', { level: 1, name: 'Recipe not found' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Title' })).not.toBeInTheDocument();
  });

  it('keeps what was typed and says so when the changes could not be sent', async () => {
    answerEditing(flatbreads, () => HttpResponse.error());
    await openForm();

    await retitle('Lamb flatbreads');
    await save();

    expect(await screen.findByText(NOT_SAVED)).toBeInTheDocument();
    expect(textbox('Title')).toHaveValue('Lamb flatbreads');
  });

  it('sends a signed-out visitor to sign in, and back to the form after', async () => {
    const { router } = renderRoute(EDIT);

    await waitFor(() => expect(router.state.location.pathname).toBe('/sign-in'));
    expect(router.state.location.search).toBe(SIGN_IN_SEARCH);
  });

  it('says the recipe is not found when Tastebook has none at the address', async () => {
    answerEditing();
    server.use(http.get(RECIPE, () => new HttpResponse(null, { status: 404 })));
    renderRoute(EDIT);

    expect(await screen.findByRole('heading', { level: 1, name: 'Recipe not found' })).toBeInTheDocument();
  });

  it("offers a retry when the recipe can't load", async () => {
    answerEditing();
    server.use(http.get(RECIPE, () => new HttpResponse(null, { status: 500 })));
    renderRoute(EDIT);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Couldn't load the recipe");

    server.use(http.get(RECIPE, () => HttpResponse.json<Recipe>(flatbreads)));
    await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('textbox', { name: 'Title' })).toHaveValue('Flatbreads');
  });

  it("offers a retry when it can't check you're signed in", async () => {
    answerEditing();
    server.use(http.get('/api/account/', () => new HttpResponse(null, { status: 503 })));
    renderRoute(EDIT);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Couldn't check you're signed in");

    server.use(http.get('/api/account/', () => HttpResponse.json<CurrentAccount>(signedIn)));
    await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Edit recipe' })).toBeInTheDocument();
  });

  it("goes to a catalogue recipe's page from its edit address", async () => {
    server.use(http.get('/api/account/', () => HttpResponse.json<CurrentAccount>(signedIn)));
    const { router } = renderRoute('/recipes/apple-tart/edit');

    expect(await screen.findByRole('heading', { level: 1, name: 'Apple tart' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/recipes/apple-tart');
    expect(screen.queryByRole('textbox', { name: 'Title' })).not.toBeInTheDocument();
  });

  it("opens with the recipe's ingredients as rows, and sends them back as they were", async () => {
    const ingredient = (slug: string, name: string) => ({ slug, name, grams_per_cup: null, awaiting_review: false });
    const sent = answerEditing({
      ...flatbreads,
      ingredient_lines: [
        {
          id: 7,
          amount: 2,
          amount_max: 3,
          unit: 'tbsp',
          ingredient: ingredient('olive-oil', 'olive oil'),
          note: '',
          optional: false,
          original_text: '2-3 tbsp good olive oil'
        }
      ],
      ingredient_groups: [
        {
          id: 3,
          name: 'For the sauce',
          lines: [
            {
              id: 8,
              amount: 0.5,
              amount_max: null,
              unit: '',
              ingredient: ingredient('garlic', 'garlic'),
              note: '',
              optional: false,
              original_text: ''
            }
          ]
        }
      ]
    });
    await openForm();

    expect(screen.getByRole('button', { name: 'Olive oil 2–3 tbsp' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Garlic 0.5' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'For the sauce' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Olive oil 2–3 tbsp' }));
    const line = screen.getByRole('dialog', { name: 'Olive oil' });
    expect(within(line).getByRole('textbox', { name: 'Amount' })).toHaveValue('2-3');
    expect(within(line).getByRole('combobox', { name: 'Unit' })).toHaveValue('tbsp');
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: 'For the sauce' }));
    expect(
      within(screen.getByRole('dialog', { name: 'Group' })).getByRole('textbox', { name: 'Group name' })
    ).toHaveValue('For the sauce');
    await userEvent.keyboard('{Escape}');
    await save();

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]?.ingredient_lines).toEqual([
      {
        amount: 2,
        amount_max: 3,
        unit: 'tbsp',
        ingredient: 'olive-oil',
        note: '',
        optional: false,
        original_text: '2-3 tbsp good olive oil'
      }
    ]);
    expect(sent[0]?.ingredient_groups).toEqual([
      {
        name: 'For the sauce',
        lines: [
          {
            amount: 0.5,
            amount_max: null,
            unit: '',
            ingredient: 'garlic',
            note: '',
            optional: false,
            original_text: ''
          }
        ]
      }
    ]);
  });
});
