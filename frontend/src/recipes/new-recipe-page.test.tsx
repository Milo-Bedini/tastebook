import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { components } from '../api/schema';
import { toast } from '../dino';
import { renderRoute } from '../test/render-route';
import { server } from '../test/server';

type CurrentAccount = components['schemas']['CurrentAccount'];
type IngredientOption = components['schemas']['IngredientOption'];
type NewIngredient = components['schemas']['NewIngredient'];
type NewIngredientLine = components['schemas']['NewIngredientLine'];
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
  diet_tag_conflicts: [],
  can_delete: false
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
        source_url: '',
        ingredient_lines: [],
        ingredient_groups: []
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
      source_url: 'https://example.com/flatbreads',
      ingredient_lines: [],
      ingredient_groups: []
    });
  });

  // Takes each half of every pair the model constrains alone: a yield and its unit, extra time and its label.
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
      'what it makes with no yield',
      async () => {
        await typeInto('Title', 'Cookies');
        await userEvent.click(screen.getByRole('radio', { name: 'Makes' }));
        await typeInto('What it makes', 'cookies');
      },
      'How many',
      'Enter a number, like 4.',
      () => typeInto('How many', '12')
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
    ],
    [
      'what the extra time is for with no extra time',
      async () => {
        await typeInto('Title', 'Curry');
        await typeInto("What it's for", 'marinating');
      },
      'Extra time',
      'Enter whole minutes, like 20.',
      () => typeInto('Extra time', '30')
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

  it.each<[string, () => Response]>([
    ['the session still says signed in', () => HttpResponse.json<CurrentAccount>(signedIn)],
    ["the session can't be checked", () => new HttpResponse(null, { status: 503 })]
  ])('says the recipe was not saved when Save is refused and %s', async (_, sessionAnswer) => {
    const state = { refused: false };
    answerAdding(() => {
      state.refused = true;
      return new HttpResponse(null, { status: 403 });
    });
    server.use(
      http.get('/api/account/', () => (state.refused ? sessionAnswer() : HttpResponse.json<CurrentAccount>(signedIn)))
    );
    const { router } = await openForm();

    await typeInto('Title', "Grandma's curry");
    await save();

    expect(
      await screen.findByText("Couldn't save the recipe. Check your connection and try again.")
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/recipes/new');
    expect(textbox('Title')).toHaveValue("Grandma's curry");
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

  describe('ingredients', () => {
    const ingredients: IngredientOption[] = [
      { slug: 'aubergine', name: 'aubergine', synonyms: ['eggplant'] },
      { slug: 'garlic', name: 'garlic', synonyms: [] },
      { slug: 'olive-oil', name: 'olive oil', synonyms: [] },
      { slug: 'onion', name: 'onion', synonyms: [] },
      { slug: 'peanuts', name: 'peanuts', synonyms: ['groundnuts'] }
    ];

    // A line as the form sends it, with nothing set but its ingredient unless given.
    const line = (ingredient: string, given: Partial<NewIngredientLine> = {}): NewIngredientLine => ({
      amount: null,
      amount_max: null,
      unit: '',
      ingredient,
      note: '',
      optional: false,
      original_text: '',
      ...given
    });

    const openWithIngredients = async () => {
      const sent = answerAdding();
      server.use(http.get('/api/ingredients/', () => HttpResponse.json<IngredientOption[]>(ingredients)));
      const rendered = await openForm();
      await screen.findByRole('combobox', { name: 'Add an ingredient' });
      return { ...rendered, sent };
    };

    const sheet = () => screen.getByRole('dialog');

    const done = () => userEvent.click(within(sheet()).getByRole('button', { name: 'Done' }));

    // Picks an ingredient in a picker, which opens its line's sheet.
    const pick = async (search: string, option: RegExp | string, picker = 'Add an ingredient') => {
      await userEvent.type(screen.getByRole('combobox', { name: picker }), search);
      await userEvent.click(screen.getByRole('option', { name: option }));
    };

    const addLine = async (name: string, amount = '', picker = 'Add an ingredient') => {
      await pick(name, new RegExp(`^${name}( ·|$)`), picker);
      if (amount !== '') {
        await userEvent.type(within(sheet()).getByRole('textbox', { name: 'Amount' }), amount);
      }
      await done();
    };

    const addGroup = async (name: string) => {
      await userEvent.click(screen.getByRole('button', { name: 'Add a group' }));
      if (name !== '') {
        await userEvent.type(within(sheet()).getByRole('textbox', { name: 'Group name' }), name);
      }
      await done();
    };

    const row = (name: RegExp | string) => screen.getByRole('button', { name });

    const savedBody = async (sent: NewRecipe[]) => {
      await typeInto('Title', 'Curry');
      await save();
      await waitFor(() => expect(sent).toHaveLength(1));
      return sent[0];
    };

    const reorder = () => userEvent.click(screen.getByRole('button', { name: 'Reorder' }));

    it('picks an ingredient, opens its sheet on Amount and sends the line', async () => {
      const { sent } = await openWithIngredients();

      await pick('onio', 'onion');

      const dialog = screen.getByRole('dialog', { name: 'Onion' });
      expect(dialog).not.toHaveAccessibleDescription();
      expect(within(dialog).getByRole('textbox', { name: 'Amount' })).toHaveFocus();
      await userEvent.type(within(dialog).getByRole('textbox', { name: 'Amount' }), '2');
      await userEvent.selectOptions(within(dialog).getByRole('combobox', { name: 'Unit' }), 'tsp');
      await done();

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(row(/^Onion/)).toHaveFocus();
      expect(row(/^Onion/)).toHaveAccessibleName('Onion 2 tsp');
      const body = await savedBody(sent);
      expect(body?.ingredient_lines).toEqual([line('onion', { amount: 2, unit: 'tsp' })]);
      expect(body?.ingredient_groups).toEqual([]);
    });

    it.each<[string, { amount?: string; unit?: string; note?: string; optional?: boolean }, string]>([
      [
        'a range, a unit, a note and optional',
        { amount: '2-3', unit: 'tbsp', note: 'extra virgin', optional: true },
        'Olive oil 2–3 tbsp, extra virgin · optional'
      ],
      ['a fraction', { amount: '½' }, 'Olive oil 0.5'],
      ['nothing', {}, 'Olive oil To taste']
    ])('writes a row with %s as the recipe will', async (_, { amount, unit, note, optional }, expected) => {
      await openWithIngredients();

      await pick('olive', 'olive oil');
      const dialog = sheet();
      if (amount !== undefined) {
        await userEvent.type(within(dialog).getByRole('textbox', { name: 'Amount' }), amount);
      }
      if (unit !== undefined) {
        await userEvent.selectOptions(within(dialog).getByRole('combobox', { name: 'Unit' }), unit);
      }
      if (note !== undefined) {
        await userEvent.type(within(dialog).getByRole('textbox', { name: 'Note' }), note);
      }
      if (optional === true) {
        await userEvent.click(within(dialog).getByRole('switch', { name: 'Optional, can be left out' }));
      }
      await done();

      expect(row(/^Olive oil/)).toHaveAccessibleName(expected);
    });

    it('keeps what was typed when the sheet closes with Escape', async () => {
      await openWithIngredients();

      await pick('onion', 'onion');
      await userEvent.type(within(sheet()).getByRole('textbox', { name: 'Amount' }), '3');
      await userEvent.keyboard('{Escape}');

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(row(/^Onion/)).toHaveFocus();
      expect(row(/^Onion/)).toHaveAccessibleName('Onion 3');
    });

    it('offers adding what the list names only in part', async () => {
      await openWithIngredients();
      const picker = screen.getByRole('combobox', { name: 'Add an ingredient' });

      await userEvent.type(picker, 'eggpl');
      expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
        'aubergine · also eggplant',
        'Add “eggpl”'
      ]);

      await userEvent.clear(picker);
      await userEvent.type(picker, 'eggplant');
      expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['aubergine · also eggplant']);
    });

    it('adds an ingredient the list does not have and opens its sheet', async () => {
      await openWithIngredients();
      const asked: NewIngredient[] = [];
      server.use(
        http.post('/api/ingredients/', async ({ request }) => {
          asked.push((await request.json()) as NewIngredient);
          return HttpResponse.json<IngredientOption>(
            { slug: 'chipotle-paste', name: 'chipotle paste', synonyms: [] },
            { status: 201 }
          );
        })
      );

      await pick('chipotle paste', 'Add “chipotle paste”');

      const dialog = await screen.findByRole('dialog', { name: 'Chipotle paste' });
      expect(asked).toEqual([{ name: 'chipotle paste' }]);
      expect(within(dialog).getByRole('textbox', { name: 'Amount' })).toHaveFocus();
      // The sheet hides the page behind it from the accessibility tree.
      expect(screen.getByRole('combobox', { name: 'Add an ingredient', hidden: true })).toHaveValue('');
    });

    it('keeps a line picked while an added ingredient is on its way', async () => {
      const { sent } = await openWithIngredients();
      const gate = { release: () => {} };
      const released = new Promise<void>((resolve) => {
        gate.release = resolve;
      });
      server.use(
        http.post('/api/ingredients/', async () => {
          await released;
          return HttpResponse.json<IngredientOption>(
            { slug: 'chipotle-paste', name: 'chipotle paste', synonyms: [] },
            { status: 201 }
          );
        })
      );

      await pick('chipotle paste', 'Add “chipotle paste”');
      expect(await screen.findByText('Adding “chipotle paste”…')).toBeInTheDocument();
      await userEvent.clear(screen.getByRole('combobox', { name: 'Add an ingredient' }));
      await addLine('onion');
      gate.release();
      await screen.findByRole('dialog', { name: 'Chipotle paste' });
      await done();

      const body = await savedBody(sent);
      expect(body?.ingredient_lines).toEqual([line('onion'), line('chipotle-paste')]);
    });

    it.each<[string, () => Response, string]>([
      [
        'refuses the name',
        () => HttpResponse.json({ name: ['Give the ingredient a name with a letter in it.'] }, { status: 400 }),
        'Give the ingredient a name with a letter in it.'
      ],
      [
        'refuses while the session still says signed in',
        () => new HttpResponse(null, { status: 403 }),
        "Couldn't add “chipotle paste”. Check your connection and try again."
      ],
      [
        "can't be reached",
        () => HttpResponse.error(),
        "Couldn't add “chipotle paste”. Check your connection and try again."
      ]
    ])('says so when Tastebook %s on adding', async (_, respond, message) => {
      await openWithIngredients();
      server.use(http.post('/api/ingredients/', respond));

      await pick('chipotle paste', 'Add “chipotle paste”');

      expect(await screen.findByText(message)).toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Chipotle paste/ })).not.toBeInTheDocument();
    });

    it('sends you to sign in when adding finds you signed out', async () => {
      const { router } = await openWithIngredients();
      const state = { signedOut: false };
      server.use(
        http.post('/api/ingredients/', () => {
          state.signedOut = true;
          return new HttpResponse(null, { status: 403 });
        }),
        http.get('/api/account/', () =>
          HttpResponse.json<CurrentAccount>(state.signedOut ? { account: null } : signedIn)
        )
      );

      await pick('chipotle paste', 'Add “chipotle paste”');

      await waitFor(() => expect(router.state.location.pathname).toBe('/sign-in'));
      expect(router.state.location.search).toBe('?next=%2Frecipes%2Fnew');
    });

    it('says where a line sits', async () => {
      await openWithIngredients();
      await addLine('onion');
      await addGroup('For the sauce');
      await addLine('garlic', '', 'Add an ingredient to For the sauce');

      await userEvent.click(row(/^Garlic/));
      expect(screen.getByRole('dialog', { name: 'Garlic' })).toHaveAccessibleDescription('In For the sauce');
      await done();
      await userEvent.click(row(/^Onion/));
      expect(screen.getByRole('dialog', { name: 'Onion' })).toHaveAccessibleDescription('Above the groups');
    });

    it('removes a line from its sheet and puts focus in its picker', async () => {
      const { sent } = await openWithIngredients();
      await addLine('onion');

      await userEvent.click(row(/^Onion/));
      await userEvent.click(within(sheet()).getByRole('button', { name: 'Remove onion' }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByText('Removed onion.')).toHaveAttribute('role', 'status');
      expect(screen.getByRole('combobox', { name: 'Add an ingredient' })).toHaveFocus();
      expect((await savedBody(sent))?.ingredient_lines).toEqual([]);
    });

    it('reorders in a mode of its own', async () => {
      await openWithIngredients();
      await addLine('onion');
      await addLine('garlic');

      await reorder();

      expect(screen.getByRole('button', { name: 'Done reordering' })).toHaveFocus();
      expect(screen.queryByRole('combobox', { name: 'Add an ingredient' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Add a group' })).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'Done reordering' }));

      expect(screen.getByRole('combobox', { name: 'Add an ingredient' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Add a group' })).toBeInTheDocument();
    });

    it('moves a line down into the group below, keeping focus on its button', async () => {
      const { sent } = await openWithIngredients();
      await addLine('onion');
      await addLine('garlic');
      await addGroup('To serve');
      await addLine('peanuts', '', 'Add an ingredient to To serve');

      await reorder();
      await userEvent.click(screen.getByRole('button', { name: 'Move onion down' }));
      expect(screen.getByText('Moved onion down.')).toBeVisible();
      await userEvent.click(screen.getByRole('button', { name: 'Move onion down' }));

      expect(screen.getByText('Moved onion into To serve.')).toHaveAttribute('role', 'status');
      expect(screen.getByRole('button', { name: 'Move onion down' })).toHaveFocus();
      const body = await savedBody(sent);
      expect(body?.ingredient_lines).toEqual([line('garlic')]);
      expect(body?.ingredient_groups).toEqual([{ name: 'To serve', lines: [line('onion'), line('peanuts')] }]);
    });

    it('moves a line up out of its group, above the groups', async () => {
      const { sent } = await openWithIngredients();
      await addLine('onion');
      await addGroup('To serve');
      await addLine('peanuts', '', 'Add an ingredient to To serve');

      await reorder();
      await userEvent.click(screen.getByRole('button', { name: 'Move peanuts up' }));

      expect(screen.getByText('Moved peanuts above the groups.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Move peanuts up' })).toHaveFocus();
      const body = await savedBody(sent);
      expect(body?.ingredient_lines).toEqual([line('onion'), line('peanuts')]);
      expect(body?.ingredient_groups).toEqual([{ name: 'To serve', lines: [] }]);
    });

    it('says why a line at an end does not move', async () => {
      const { sent } = await openWithIngredients();
      await addLine('garlic');
      await addLine('onion');

      await reorder();
      await userEvent.click(screen.getByRole('button', { name: 'Move garlic up' }));

      expect(screen.getByRole('button', { name: 'Move garlic up' })).not.toHaveAttribute('aria-disabled');
      expect(screen.getByText('Garlic is already first.')).toHaveAttribute('role', 'status');
      expect((await savedBody(sent))?.ingredient_lines).toEqual([line('garlic'), line('onion')]);
    });

    it('moves a group with its lines past the group before it', async () => {
      const { sent } = await openWithIngredients();
      await addGroup('For the sauce');
      await addLine('garlic', '', 'Add an ingredient to For the sauce');
      await addGroup('To serve');
      await addLine('peanuts', '', 'Add an ingredient to To serve');

      await reorder();
      await userEvent.click(screen.getByRole('button', { name: 'Move group To serve up' }));

      expect(screen.getByText('Moved group To serve up.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Move group To serve up' })).toHaveFocus();
      await userEvent.click(screen.getByRole('button', { name: 'Move group To serve up' }));
      expect(screen.getByText('To serve is already the first group.')).toBeInTheDocument();
      expect((await savedBody(sent))?.ingredient_groups).toEqual([
        { name: 'To serve', lines: [line('peanuts')] },
        { name: 'For the sauce', lines: [line('garlic')] }
      ]);
    });

    it('removes a group, its lines joining the list above', async () => {
      const { sent } = await openWithIngredients();
      await addLine('onion');
      await addGroup('For the sauce');
      await addLine('garlic', '', 'Add an ingredient to For the sauce');

      await userEvent.click(row('For the sauce'));
      await userEvent.click(within(sheet()).getByRole('button', { name: 'Remove group' }));

      expect(screen.getByRole('button', { name: 'Add a group' })).toHaveFocus();
      expect(screen.getByText('Removed group For the sauce. Its ingredients joined the list above.')).toHaveAttribute(
        'role',
        'status'
      );
      const body = await savedBody(sent);
      expect(body?.ingredient_lines).toEqual([line('onion'), line('garlic')]);
      expect(body?.ingredient_groups).toEqual([]);
    });

    it("opens the first amount in error on Save, and marks each row that's wrong", async () => {
      const { sent } = await openWithIngredients();
      await addLine('onion', '3-2');
      await addLine('garlic', '0');
      await typeInto('Title', 'Curry');

      await save();

      const dialog = screen.getByRole('dialog', { name: 'Onion' });
      const amount = within(dialog).getByRole('textbox', { name: 'Amount' });
      expect(amount).toHaveAccessibleDescription('Put the smaller amount first, like 2-3.');
      expect(amount).toHaveFocus();
      expect(sent).toEqual([]);

      await userEvent.keyboard('{Escape}');

      expect(row(/^Onion/)).toHaveFocus();
      expect(row(/^Onion/)).toHaveAccessibleDescription('Put the smaller amount first, like 2-3.');
      expect(row(/^Garlic/)).toHaveAccessibleDescription('Enter an amount above 0, or leave it empty.');
    });

    it('ends the Reorder mode when Save opens a sheet', async () => {
      await openWithIngredients();
      await addLine('onion', '3-2');
      await addLine('garlic', '0');
      await typeInto('Title', 'Curry');
      await reorder();

      await save();

      expect(screen.queryByRole('button', { name: 'Done reordering' })).not.toBeInTheDocument();
      expect(
        within(screen.getByRole('dialog', { name: 'Onion' })).getByRole('textbox', { name: 'Amount' })
      ).toHaveFocus();
    });

    it("opens a group's sheet on its name once the details pass", async () => {
      await openWithIngredients();
      await addGroup('');

      await save();

      expect(textbox('Title')).toHaveFocus();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      await typeInto('Title', 'Curry');
      await save();

      const name = within(screen.getByRole('dialog', { name: 'Group' })).getByRole('textbox', { name: 'Group name' });
      expect(name).toHaveAccessibleDescription('Give the group a name, like For the sauce.');
      expect(name).toHaveFocus();
    });

    it("sums up Tastebook's refusal of a line in the banner", async () => {
      answerAdding(() =>
        HttpResponse.json({ ingredient_lines: { '1': { amount: ['Give an amount above 0.'] } } }, { status: 400 })
      );
      await openForm();

      await typeInto('Title', 'Curry');
      await save();

      expect(await screen.findByRole('alert')).toHaveTextContent(
        "Couldn't save the recipeSome ingredients couldn't be saved. Check them and try again."
      );
    });

    it("offers a retry when the ingredients can't load", async () => {
      answerAdding();
      server.use(http.get('/api/ingredients/', () => new HttpResponse(null, { status: 500 })));
      await openForm();

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent("Couldn't load the ingredients");
      expect(screen.queryByRole('combobox', { name: 'Add an ingredient' })).not.toBeInTheDocument();

      server.use(http.get('/api/ingredients/', () => HttpResponse.json<IngredientOption[]>(ingredients)));
      await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }));

      expect(await screen.findByRole('combobox', { name: 'Add an ingredient' })).toBeInTheDocument();
    });
  });
});
