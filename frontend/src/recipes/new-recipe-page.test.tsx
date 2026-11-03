import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { components } from '../api/schema';
import { toast } from '../dino';
import { renderRoute } from '../test/render-route';
import { server } from '../test/server';

type CurrentAccount = components['schemas']['CurrentAccount'];
type NewRecipe = components['schemas']['NewRecipe'];
type Recipe = components['schemas']['Recipe'];

const RECIPES = '/api/recipes/';

const signedIn: CurrentAccount = { account: { email: 'sam@example.com', name: 'Sam', unit_system: 'metric' } };

const saved: Recipe = {
  id: 41,
  slug: 'grandmas-curry-k7m2qx',
  visibility: 'private',
  title: "Grandma's curry",
  description: '',
  cuisines: [],
  courses: [],
  difficulty: '',
  prep_minutes: null,
  cook_minutes: null,
  extra_minutes: 0,
  extra_label: '',
  total_minutes: null,
  photo: null,
  diet_tags: [],
  servings: null,
  yield_amount: null,
  yield_unit: '',
  equipment: [],
  one_pot: false,
  source: '',
  source_url: '',
  ingredient_lines: [],
  ingredient_groups: [],
  steps: [],
  diet_tag_conflicts: []
};

// Signed in, with each POST body recorded and answered by `respond`; the saved recipe's page answers with it.
const answerAdding = (respond: () => Response = () => HttpResponse.json<Recipe>(saved, { status: 201 })) => {
  const sent: NewRecipe[] = [];
  server.use(
    http.get('/api/account/', () => HttpResponse.json<CurrentAccount>(signedIn)),
    http.post(RECIPES, async ({ request }) => {
      sent.push((await request.json()) as NewRecipe);
      return respond();
    }),
    http.get('/api/recipes/:slug/', () => HttpResponse.json<Recipe>(saved))
  );
  return sent;
};

const textbox = (name: string) => screen.getByRole('textbox', { name });

const typeInto = async (name: string, text: string) => userEvent.type(textbox(name), text);

const openForm = async () => {
  const rendered = renderRoute('/recipes/new');
  await screen.findByRole('heading', { level: 1, name: 'Add a recipe' });
  return rendered;
};

const save = () => userEvent.click(screen.getByRole('button', { name: 'Save recipe' }));

const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

describe('NewRecipePage', () => {
  beforeEach(() => {
    // biome-ignore lint/suspicious/noDocumentCookie: Django's account request sets this cookie; jsdom has no Cookie Store
    document.cookie = 'csrftoken=abc';
  });

  // Sonner keeps its toasts outside React, so one test's toast would still show in the next.
  afterEach(() => {
    toast.dismiss();
  });

  it('sends a signed-out visitor to sign in, and back to the form after', async () => {
    const { router } = renderRoute('/recipes/new');

    await waitFor(() => expect(router.state.location.pathname).toBe('/sign-in'));
    expect(router.state.location.search).toBe('?next=%2Frecipes%2Fnew');
  });

  it('says it is opening the form until the session answers, and titles the tab', async () => {
    answerAdding();
    renderRoute('/recipes/new');

    expect(screen.getByText('Opening the form…')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 1, name: 'Add a recipe' })).toBeInTheDocument();
    expect(document.title).toBe('Add a recipe · Tastebook');
  });

  it("offers a retry when it can't check you're signed in", async () => {
    server.use(http.get('/api/account/', () => new HttpResponse(null, { status: 503 })));
    renderRoute('/recipes/new');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Couldn't check you're signed in");

    server.use(http.get('/api/account/', () => HttpResponse.json<CurrentAccount>(signedIn)));
    await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Add a recipe' })).toBeInTheDocument();
  });

  it('saves a recipe with only a title, sending every other detail empty, and opens it', async () => {
    const sent = answerAdding();
    const { router } = await openForm();

    await typeInto('Title', "Grandma's curry");
    await save();

    expect(await screen.findByRole('heading', { level: 1, name: "Grandma's curry" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/recipes/grandmas-curry-k7m2qx');
    expect(sent).toEqual([
      {
        title: "Grandma's curry",
        description: '',
        cuisines: [],
        courses: [],
        difficulty: '',
        prep_minutes: null,
        cook_minutes: null,
        extra_minutes: 0,
        extra_label: '',
        servings: null,
        yield_amount: null,
        yield_unit: '',
        one_pot: false,
        source: '',
        source_url: ''
      }
    ]);
  });

  it('sends every detail typed, and only the yield once Makes is chosen', async () => {
    const sent = answerAdding();
    await openForm();

    await typeInto('Title', "Za'atar flatbreads");
    await typeInto('Description', 'Soft, blistered flatbreads.');
    await userEvent.click(await screen.findByRole('button', { name: 'Italian' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Main' }));
    await userEvent.click(
      within(screen.getByRole('group', { name: 'Difficulty' })).getByRole('radio', { name: 'Medium' })
    );
    await userEvent.click(screen.getByRole('switch', { name: 'One-pot' }));
    await typeInto('Prep time', '15');
    await typeInto('Cook time', '30');
    await typeInto('Extra time', '60');
    await typeInto("What it's for", 'proving');
    await typeInto('How many people', '4');
    await userEvent.click(screen.getByRole('radio', { name: 'Makes' }));
    await typeInto('How many', '12');
    await typeInto('What it makes', 'flatbreads');
    await typeInto('Source credit', 'Grandma Bedini');
    await typeInto('Source address', 'https://example.com/flatbreads');
    await save();

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({
      title: "Za'atar flatbreads",
      description: 'Soft, blistered flatbreads.',
      cuisines: ['italian'],
      courses: ['main'],
      difficulty: 'medium',
      prep_minutes: 15,
      cook_minutes: 30,
      extra_minutes: 60,
      extra_label: 'proving',
      servings: null,
      yield_amount: 12,
      yield_unit: 'flatbreads',
      one_pot: true,
      source: 'Grandma Bedini',
      source_url: 'https://example.com/flatbreads'
    });
  });

  it.each<[string, () => Promise<unknown>, string, string, () => Promise<unknown>]>([
    [
      'an empty title',
      async () => {},
      'Title',
      "Give the recipe a title, like Grandma's curry.",
      () => typeInto('Title', 'Curry')
    ],
    [
      'a prep time in words',
      async () => {
        await typeInto('Title', 'Curry');
        await typeInto('Prep time', 'ten');
      },
      'Prep time',
      'Enter whole minutes, like 20.',
      async () => {
        await userEvent.clear(textbox('Prep time'));
        await typeInto('Prep time', '10');
      }
    ],
    [
      'a yield with nothing it makes',
      async () => {
        await typeInto('Title', 'Cookies');
        await userEvent.click(screen.getByRole('radio', { name: 'Makes' }));
        await typeInto('How many', '12');
      },
      'What it makes',
      'Say what it makes, like cookies.',
      () => typeInto('What it makes', 'cookies')
    ],
    [
      "extra time with nothing it's for",
      async () => {
        await typeInto('Title', 'Curry');
        await typeInto('Extra time', '30');
      },
      "What it's for",
      'Say what the extra time is for, like marinating.',
      () => typeInto("What it's for", 'marinating')
    ]
  ])('refuses %s before sending, under its field, then sends once fixed', async (_, fill, field, message, fix) => {
    const sent = answerAdding();
    await openForm();

    await fill();
    await save();

    expect(textbox(field)).toHaveAccessibleDescription(new RegExp(`^${escaped(message)}`));
    expect(textbox(field)).toHaveAttribute('aria-invalid', 'true');
    expect(textbox(field)).toHaveFocus();
    expect(sent).toEqual([]);

    await fix();
    await save();

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(screen.queryByText(message)).not.toBeInTheDocument();
  });

  it('says "Saving…" and is busy while the recipe saves', async () => {
    const gate = { release: () => {} };
    const released = new Promise<void>((resolve) => {
      gate.release = resolve;
    });
    answerAdding();
    server.use(
      http.post(RECIPES, async () => {
        await released;
        return HttpResponse.json<Recipe>(saved, { status: 201 });
      })
    );
    await openForm();

    await typeInto('Title', "Grandma's curry");
    await save();

    const saving = await screen.findByRole('button', { name: 'Saving…' });
    expect(saving).toHaveAttribute('aria-busy', 'true');

    gate.release();
    expect(await screen.findByRole('heading', { level: 1, name: "Grandma's curry" })).toBeInTheDocument();
  });

  it("shows Tastebook's refusal of the title under the title", async () => {
    answerAdding(() =>
      HttpResponse.json({ title: ["Give the recipe a title, like Grandma's curry."] }, { status: 400 })
    );
    await openForm();

    await typeInto('Title', 'Curry');
    await save();

    await waitFor(() =>
      expect(textbox('Title')).toHaveAccessibleDescription("Give the recipe a title, like Grandma's curry.")
    );
    expect(textbox('Title')).toHaveFocus();
    expect(textbox('Title')).toHaveValue('Curry');
  });

  it('shows a refusal that names no field in a banner above Save, which takes focus', async () => {
    answerAdding(() =>
      HttpResponse.json({ non_field_errors: ['Give servings or a yield with its unit, not both.'] }, { status: 400 })
    );
    await openForm();

    await typeInto('Title', 'Curry');
    await save();

    const banner = await screen.findByRole('alert');
    expect(banner).toHaveTextContent("Couldn't save the recipeGive servings or a yield with its unit, not both.");
    expect(banner.parentElement).toHaveFocus();
  });

  it('sends you to sign in when Tastebook says you are signed out on Save', async () => {
    const state = { signedOut: false };
    answerAdding(() => {
      state.signedOut = true;
      return new HttpResponse(null, { status: 403 });
    });
    server.use(
      http.get('/api/account/', () => HttpResponse.json<CurrentAccount>(state.signedOut ? { account: null } : signedIn))
    );
    const { router } = await openForm();

    await typeInto('Title', 'Curry');
    await save();

    await waitFor(() => expect(router.state.location.pathname).toBe('/sign-in'));
    expect(router.state.location.search).toBe('?next=%2Frecipes%2Fnew');
  });

  it('keeps what was typed and says so when the recipe could not be sent', async () => {
    answerAdding(() => HttpResponse.error());
    await openForm();

    await typeInto('Title', "Grandma's curry");
    await save();

    expect(
      await screen.findByText("Couldn't save the recipe. Check your connection and try again.")
    ).toBeInTheDocument();
    expect(textbox('Title')).toHaveValue("Grandma's curry");
  });

  it("shows a retry in the Cuisines group when the cuisines can't load, while the rest of the form works", async () => {
    answerAdding();
    server.use(http.get('/api/cuisines/', () => new HttpResponse(null, { status: 503 })));
    await openForm();

    const cuisines = screen.getByRole('group', { name: 'Cuisines' });
    expect(await within(cuisines).findByRole('alert')).toHaveTextContent("Couldn't load the cuisines");
    expect(
      await within(screen.getByRole('group', { name: 'Courses' })).findByRole('button', { name: 'Main' })
    ).toBeInTheDocument();

    await typeInto('Title', 'Curry');
    expect(textbox('Title')).toHaveValue('Curry');
  });

  it('shows the cuisines loading in their group', async () => {
    answerAdding();
    await openForm();

    expect(within(screen.getByRole('group', { name: 'Cuisines' })).getByRole('status')).toHaveTextContent(
      'Loading cuisines…'
    );
    expect(await screen.findByRole('button', { name: 'Italian' })).toBeInTheDocument();
  });
});
