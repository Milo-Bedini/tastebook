import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';

import type { components } from '../api/schema';
import { setLaptop } from '../test/media';
import { renderRoute } from '../test/render-route';
import { server } from '../test/server';

type Recipe = components['schemas']['Recipe'];
type IngredientLine = components['schemas']['IngredientLine'];
type RecipePhoto = components['schemas']['RecipePhoto'];
type CurrentAccount = components['schemas']['CurrentAccount'];
type UnitSystem = components['schemas']['UnitSystem'];

const shakshuka: Recipe = {
  id: 7,
  slug: 'shakshuka',
  visibility: 'public',
  title: 'Shakshuka',
  description: 'Eggs in spiced tomatoes.',
  cuisines: [],
  courses: [{ slug: 'main', name: 'Main' }],
  difficulty: 'easy',
  prep_minutes: 10,
  cook_minutes: 25,
  extra_minutes: 0,
  extra_label: '',
  total_minutes: 35,
  photo: null,
  diet_tags: [],
  servings: 2,
  yield_amount: null,
  yield_unit: '',
  equipment: [{ slug: 'hob', name: 'Hob' }],
  one_pot: true,
  source: 'Adapted from the Wikibooks Cookbook (CC BY-SA 4.0)',
  source_url: '',
  ingredient_lines: [],
  ingredient_groups: [],
  steps: [],
  diet_tag_conflicts: []
};

const photo: RecipePhoto = {
  thumbnails: [
    { width: 330, url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7e/Shakshuka.jpg/330px-Shakshuka.jpg' },
    { width: 1280, url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7e/Shakshuka.jpg/1280px-Shakshuka.jpg' }
  ],
  author: 'Jane Doe',
  licence: 'CC BY-SA 4.0',
  source_url: 'https://commons.wikimedia.org/wiki/File:Shakshuka.jpg'
};

// Each time blob's label with its time, in the order the page shows them.
const blobs = () => {
  const definitions = screen.getAllByRole('definition');
  return screen.getAllByRole('term').map((term, index) => [term.textContent, definitions[index]?.textContent]);
};

const paragraphs = () => screen.queryAllByRole('paragraph').map((paragraph) => paragraph.textContent);

// The stickers are spans with no role, read in order between the photo's figure and the title.
const stickers = () => {
  const figure = screen.getByRole('figure');
  const title = screen.getByRole('heading', { level: 1 });
  return [...document.querySelectorAll('span')]
    .filter(
      (span) =>
        figure.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING &&
        span.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING &&
        span.children.length === 0
    )
    .map((span) => span.textContent);
};

const line = (id: number, name: string, fields: Partial<IngredientLine> = {}): IngredientLine => ({
  id,
  amount: null,
  amount_max: null,
  unit: '',
  ingredient: { slug: name.replaceAll(' ', '-'), name, grams_per_cup: null },
  note: '',
  optional: false,
  original_text: '',
  ...fields
});

const withIngredientsAndMethod: Recipe = {
  ...shakshuka,
  ingredient_lines: [
    line(1, 'olive oil', { amount: 1.5, unit: 'tbsp' }),
    line(2, 'eggs', { amount: 2, amount_max: 3 }),
    line(3, 'salt', { note: 'to taste' })
  ],
  ingredient_groups: [
    {
      id: 1,
      name: 'For the sauce',
      lines: [
        line(4, 'onion', { amount: 1, note: 'finely chopped' }),
        line(5, 'garlic', { amount: 2, unit: 'clove', note: 'crushed' }),
        line(6, 'chopped tomatoes', { amount: 1, unit: 'tin' })
      ]
    },
    { id: 2, name: 'To serve', lines: [line(7, 'coriander', { unit: 'handful', optional: true })] },
    { id: 3, name: 'Not filled in yet', lines: [] }
  ],
  steps: [
    { id: 1, text: 'Fry the onion in the oil until soft.' },
    { id: 2, text: 'Add the garlic and tomatoes and simmer for 10 minutes.' },
    { id: 3, text: 'Crack in the eggs, cover and cook until set.' }
  ]
};

// As a screen reader reads each line: the leader between name and amount is drawn, not read.
const itemsOf = (list: HTMLElement) =>
  within(list)
    .getAllByRole('listitem')
    .map((item) => item.textContent?.replace(/\s+/g, ' ').trim());

// The step numbers are drawn for the eye; the ordered list numbers each step for a screen reader.
const stepsOf = (list: HTMLElement) =>
  within(list)
    .getAllByRole('listitem')
    .map((item) => within(item).getByRole('paragraph').textContent);

const failRecipe = () => server.use(http.get('/api/recipes/:slug/', () => new HttpResponse(null, { status: 503 })));

// Holds the next recipe response until released, so the test can see the page while the request is in flight.
const holdRecipe = (respond: () => Response) => {
  const gate = { release: () => {} };
  const released = new Promise<void>((resolve) => {
    gate.release = resolve;
  });
  server.use(
    http.get('/api/recipes/:slug/', async () => {
      await released;
      return respond();
    })
  );
  return () => gate.release();
};

// A dry good: what a US cup of it weighs, from USDA FoodData Central.
const plainFlour = { slug: 'plain-flour', name: 'plain flour', grams_per_cup: 125 };

const withFlour: Recipe = { ...shakshuka, ingredient_lines: [line(1, 'plain flour', { amount: 1, unit: 'cup' })] };

// Signed in as Sam, who chose these units, with the recipe above; records any PATCH to the account.
const answerSignedIn = (unitSystem: UnitSystem) => {
  const saves: unknown[] = [];
  server.use(
    http.get('/api/recipes/:slug/', () => HttpResponse.json<Recipe>(withFlour)),
    http.get('/api/account/', () =>
      HttpResponse.json<CurrentAccount>({
        account: { email: 'sam@example.com', name: 'Sam', unit_system: unitSystem }
      })
    ),
    http.patch('/api/account/', async ({ request }) => {
      saves.push(await request.json());
      return new HttpResponse(null, { status: 500 });
    })
  );
  return saves;
};

describe('RecipePage', () => {
  it('shows a loading message, then the recipe', async () => {
    const release = holdRecipe(() => HttpResponse.json<Recipe>(shakshuka));

    renderRoute('/recipes/shakshuka');

    expect((await screen.findByText('Opening the recipe…')).closest('[aria-busy="true"]')).not.toBeNull();
    await waitFor(() => expect(document.title).toBe('Recipe · Tastebook'));

    release();

    expect(await screen.findByRole('heading', { level: 1, name: 'Shakshuka' })).toBeInTheDocument();
    expect(screen.getByText('Eggs in spiced tomatoes.')).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('Shakshuka · Tastebook'));
    expect(screen.queryByText('Opening the recipe…')).not.toBeInTheDocument();
  });

  it.each([
    [
      'apple-tart',
      'Apple tart',
      [
        'Sharp apples on buttery pastry.',
        '1 hr 40 min · Medium · French · Dessert · Serves 8',
        'Equipment: Oven',
        'Source: Tastebook'
      ]
    ],
    ['banana-bread', 'Banana bread', ['1 hr 15 min · Easy · Makes 1 loaf']]
  ])(
    'shows the description, facts, equipment and source lines only when the recipe has them (%s)',
    async (slug, title, lines) => {
      renderRoute(`/recipes/${slug}`);

      expect(await screen.findByRole('heading', { level: 1, name: title })).toBeInTheDocument();
      expect(paragraphs()).toEqual(lines);
    }
  );

  it.each([
    [photo, ['Shakshuka']],
    [null, []]
  ])('shows a photo above the title only when the recipe has one', async (recipePhoto, images) => {
    server.use(http.get('/api/recipes/:slug/', () => HttpResponse.json<Recipe>({ ...shakshuka, photo: recipePhoto })));

    renderRoute('/recipes/shakshuka');

    expect(await screen.findByRole('heading', { level: 1, name: 'Shakshuka' })).toBeInTheDocument();
    expect(screen.queryAllByRole('img').map((image) => image.getAttribute('alt'))).toEqual(images);
  });

  it('loads the photo at once at the page width without cookies, credited with its author, licence and a link to its page', async () => {
    server.use(http.get('/api/recipes/:slug/', () => HttpResponse.json<Recipe>({ ...shakshuka, photo })));

    renderRoute('/recipes/shakshuka');

    const figure = await screen.findByRole('figure');
    expect(figure).toHaveTextContent(/^Photo by Jane Doe, CC BY-SA 4\.0, via Wikimedia Commons$/);
    const image = within(figure).getByRole('img', { name: 'Shakshuka' });
    expect(image).toHaveAttribute(
      'srcset',
      'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7e/Shakshuka.jpg/330px-Shakshuka.jpg 330w, ' +
        'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7e/Shakshuka.jpg/1280px-Shakshuka.jpg 1280w'
    );
    expect(image).toHaveAttribute(
      'sizes',
      '(min-width: 75rem) 23.7rem, (min-width: 64rem) calc(41.7vw - 7.6rem), (min-width: 46rem) 40.75rem, ' +
        '(min-width: 40rem) calc(100vw - 5.25rem), calc(100vw - 3.75rem)'
    );
    expect(image).toHaveAttribute('loading', 'eager');
    expect(image).toHaveAttribute('crossorigin', 'anonymous');
    expect(within(figure).getByRole('link', { name: 'Wikimedia Commons' })).toHaveAttribute(
      'href',
      'https://commons.wikimedia.org/wiki/File:Shakshuka.jpg'
    );
  });

  it("shows the rug without a credit when the photo can't load", async () => {
    server.use(http.get('/api/recipes/:slug/', () => HttpResponse.json<Recipe>({ ...shakshuka, photo })));

    renderRoute('/recipes/shakshuka');

    expect(await screen.findByRole('figure')).toBeInTheDocument();
    expect(document.querySelectorAll('[data-filler]')).toHaveLength(0);

    fireEvent.error(screen.getByRole('img', { name: 'Shakshuka' }));

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByText(/Photo by/)).not.toBeInTheDocument();
    // The rug is decorative, so it has no role: its data-filler is the only handle on the drawing.
    expect([...document.querySelectorAll('[data-filler]')].map((filler) => filler.getAttribute('data-filler'))).toEqual(
      ['rug']
    );
  });

  it.each<[string, Recipe, string]>([
    [
      'with ingredients',
      {
        ...withIngredientsAndMethod,
        total_minutes: 45,
        cuisines: [{ slug: 'indian', name: 'Indian' }]
      },
      '45 min · Easy · One-pot · Indian · Main'
    ],
    ['without ingredients, so with its servings', shakshuka, '35 min · Easy · One-pot · Main · Serves 2']
  ])('starts the facts line with the total time (%s)', async (_case, recipe, facts) => {
    server.use(http.get('/api/recipes/:slug/', () => HttpResponse.json<Recipe>(recipe)));

    renderRoute('/recipes/shakshuka');

    expect(await screen.findByRole('heading', { level: 1, name: 'Shakshuka' })).toBeInTheDocument();
    expect(paragraphs()).toContain(facts);
  });

  it.each<[string, Partial<Recipe>, string[][]]>([
    [
      'prep and cook',
      {},
      [
        ['Prep', '10 min'],
        ['Cook', '25 min']
      ]
    ],
    [
      'and soaking',
      { extra_minutes: 720, extra_label: 'soaking', total_minutes: 755 },
      [
        ['Prep', '10 min'],
        ['Cook', '25 min'],
        ['Soaking', '12 hr']
      ]
    ]
  ])('shows the times in blobs (%s)', async (_case, fields, times) => {
    server.use(http.get('/api/recipes/:slug/', () => HttpResponse.json<Recipe>({ ...shakshuka, ...fields })));

    renderRoute('/recipes/shakshuka');

    expect(await screen.findByRole('heading', { level: 1, name: 'Shakshuka' })).toBeInTheDocument();
    expect(blobs()).toEqual(times);
  });

  it.each<[string, Partial<Recipe>, string[][]]>([
    ['only a prep time', { prep_minutes: 20, cook_minutes: null }, [['Prep', '20 min']]],
    ['only a cook time', { prep_minutes: null }, [['Cook', '25 min']]],
    [
      'a cook time and extra time, no prep',
      { prep_minutes: null, extra_minutes: 120, extra_label: 'marinating' },
      [
        ['Cook', '25 min'],
        ['Marinating', '2 hr']
      ]
    ]
  ])('shows only the times a recipe has, and no total time, for %s', async (_, times, shown) => {
    server.use(
      http.get('/api/recipes/:slug/', () => HttpResponse.json<Recipe>({ ...shakshuka, ...times, total_minutes: null }))
    );

    renderRoute('/recipes/shakshuka');

    expect(await screen.findByRole('heading', { level: 1, name: 'Shakshuka' })).toBeInTheDocument();
    expect(blobs()).toEqual(shown);
    expect(paragraphs()).toContain('Easy · One-pot · Main · Serves 2');
  });

  it('shows no time blobs for a recipe with no times', async () => {
    server.use(
      http.get('/api/recipes/:slug/', ({ params }) =>
        HttpResponse.json<Recipe>(
          params.slug === 'shakshuka'
            ? { ...shakshuka, prep_minutes: null, cook_minutes: null, total_minutes: null }
            : { ...shakshuka, slug: 'flatbreads', title: 'Flatbreads' }
        )
      )
    );

    const { router } = renderRoute('/recipes/shakshuka');

    expect(await screen.findByRole('heading', { level: 1, name: 'Shakshuka' })).toBeInTheDocument();
    expect(screen.queryByRole('term')).not.toBeInTheDocument();

    await act(() => router.navigate('/recipes/flatbreads'));

    expect(await screen.findByRole('heading', { level: 1, name: 'Flatbreads' })).toBeInTheDocument();
    expect(blobs()).toEqual([
      ['Prep', '10 min'],
      ['Cook', '25 min']
    ]);
  });

  it('leaves a private recipe for "Recipe not found" when its household member signs out on it', async () => {
    const signOuts: string[] = [];
    const curry: Recipe = {
      ...shakshuka,
      slug: 'grandmas-curry-k7m2qx',
      visibility: 'private',
      title: "Grandma's curry"
    };
    server.use(
      http.get('/api/account/', () =>
        HttpResponse.json<CurrentAccount>({
          account: signOuts.length > 0 ? null : { email: 'sam@example.com', name: 'Sam', unit_system: 'metric' }
        })
      ),
      // allauth answers a sign out with 401: nobody is signed in now.
      http.delete('/api/_allauth/browser/v1/auth/session', ({ request }) => {
        signOuts.push(new URL(request.url).pathname);
        return HttpResponse.json(
          { status: 401, data: { flows: [] }, meta: { is_authenticated: false } },
          { status: 401 }
        );
      }),
      // Only a member of its household is shown it: signed out, it isn't found.
      http.get('/api/recipes/:slug/', () =>
        signOuts.length > 0 ? new HttpResponse(null, { status: 404 }) : HttpResponse.json<Recipe>(curry)
      )
    );
    renderRoute('/recipes/grandmas-curry-k7m2qx');
    expect(await screen.findByRole('heading', { level: 1, name: "Grandma's curry" })).toBeInTheDocument();

    await userEvent.click(await screen.findByRole('button', { name: 'Account for Sam' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Sign out' }));

    expect(await screen.findByRole('heading', { name: 'Recipe not found' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: "Grandma's curry" })).not.toBeInTheDocument();
  });

  it('puts the squiggle under the longest word of the name', async () => {
    server.use(
      http.get('/api/recipes/:slug/', () =>
        HttpResponse.json<Recipe>({ ...shakshuka, title: 'Slow-roasted pork shoulder' })
      )
    );

    renderRoute('/recipes/shakshuka');

    const heading = await screen.findByRole('heading', { level: 1, name: 'Slow-roasted pork shoulder' });
    expect(heading.querySelector('svg')?.parentElement).toHaveTextContent(/^Slow-roasted$/);
  });

  it.each([
    ['https://en.wikibooks.org/wiki/Cookbook:Shakshouka', 1],
    ['', 0]
  ])(
    'links the source credit to the original page only when the recipe has its address (%s)',
    async (sourceUrl, count) => {
      server.use(
        http.get('/api/recipes/:slug/', () => HttpResponse.json<Recipe>({ ...shakshuka, source_url: sourceUrl }))
      );

      renderRoute('/recipes/shakshuka');

      expect(await screen.findByRole('heading', { name: 'Shakshuka' })).toBeInTheDocument();
      expect(paragraphs()).toContain('Equipment: Hob');
      expect(paragraphs()).toContain('Source: Adapted from the Wikibooks Cookbook (CC BY-SA 4.0)');
      const links = screen.queryAllByRole('link', { name: 'Adapted from the Wikibooks Cookbook (CC BY-SA 4.0)' });
      expect(links).toHaveLength(count);
      expect(links.map((link) => link.getAttribute('href'))).toEqual(sourceUrl === '' ? [] : [sourceUrl]);
    }
  );

  it.each<[Recipe['diet_tags'], Recipe['diet_tag_conflicts'], string[], string[]]>([
    [[], [], [], []],
    [
      ['vegetarian', 'vegan', 'dairy_free'],
      [{ ingredient: { slug: 'parmesan', name: 'parmesan', grams_per_cup: null }, diet_tags: ['vegan', 'dairy_free'] }],
      ['Vegan'],
      ['Leave out the parmesan to keep it vegan and dairy-free.']
    ],
    [
      ['vegetarian', 'gluten_free', 'dairy_free'],
      [{ ingredient: { slug: 'butter', name: 'butter', grams_per_cup: null }, diet_tags: ['dairy_free'] }],
      ['Vegetarian', 'Gluten-free', 'Dairy-free'],
      ['Leave out the butter to keep it dairy-free.']
    ],
    [
      ['vegetarian', 'vegan', 'gluten_free', 'dairy_free'],
      [
        { ingredient: { slug: 'bacon', name: 'bacon', grams_per_cup: null }, diet_tags: ['vegetarian', 'vegan'] },
        { ingredient: { slug: 'eggs', name: 'eggs', grams_per_cup: null }, diet_tags: ['vegan'] },
        {
          ingredient: { slug: 'croutons', name: 'butter croutons', grams_per_cup: null },
          diet_tags: ['vegan', 'gluten_free', 'dairy_free']
        }
      ],
      ['Vegan', 'Gluten-free'],
      [
        'Leave out the bacon to keep it vegetarian and vegan.',
        'Leave out the eggs to keep it vegan.',
        'Leave out the butter croutons to keep it vegan, gluten-free and dairy-free.'
      ]
    ]
  ])(
    'shows the diet tags %j and says which optional ingredient would take one away',
    async (dietTags, conflicts, shownTags, sentences) => {
      server.use(
        http.get('/api/recipes/:slug/', () =>
          HttpResponse.json<Recipe>({ ...shakshuka, photo, diet_tags: dietTags, diet_tag_conflicts: conflicts })
        )
      );

      renderRoute('/recipes/shakshuka');

      expect(await screen.findByRole('heading', { name: 'Shakshuka' })).toBeInTheDocument();
      expect(stickers()).toEqual(shownTags);
      expect(paragraphs()).toEqual([
        'Eggs in spiced tomatoes.',
        '35 min · Easy · One-pot · Main · Serves 2',
        'Equipment: Hob',
        'Source: Adapted from the Wikibooks Cookbook (CC BY-SA 4.0)',
        ...sentences
      ]);
    }
  );

  it('shows no sticker as a button or a link', async () => {
    server.use(
      http.get('/api/recipes/:slug/', () => HttpResponse.json<Recipe>({ ...shakshuka, diet_tags: ['vegan'] }))
    );

    renderRoute('/recipes/shakshuka');

    expect(await screen.findByText('Vegan')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Vegan' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Vegan' })).not.toBeInTheDocument();
  });

  it('shows extra time with its label, a yield, and several cuisines, courses and pieces of equipment', async () => {
    server.use(
      http.get('/api/recipes/:slug/', () =>
        HttpResponse.json<Recipe>({
          ...shakshuka,
          cuisines: [
            { slug: 'japanese', name: 'Japanese' },
            { slug: 'mexican', name: 'Mexican' }
          ],
          courses: [
            { slug: 'baking', name: 'Baking' },
            { slug: 'dessert', name: 'Dessert' }
          ],
          difficulty: 'hard',
          prep_minutes: 20,
          cook_minutes: 45,
          extra_minutes: 120,
          extra_label: 'proving',
          total_minutes: 185,
          photo: null,
          servings: null,
          yield_amount: 12,
          yield_unit: 'buns',
          equipment: [
            { slug: 'oven', name: 'Oven' },
            { slug: 'stand-mixer', name: 'Stand mixer' }
          ],
          one_pot: false
        })
      )
    );

    renderRoute('/recipes/shakshuka');

    expect(await screen.findByRole('heading', { name: 'Shakshuka' })).toBeInTheDocument();
    expect(paragraphs()).toEqual([
      'Eggs in spiced tomatoes.',
      '3 hr 5 min · Hard · Japanese, Mexican · Baking, Dessert · Makes 12 buns',
      'Equipment: Oven, Stand mixer',
      'Source: Adapted from the Wikibooks Cookbook (CC BY-SA 4.0)'
    ]);
    expect(blobs()).toEqual([
      ['Prep', '20 min'],
      ['Cook', '45 min'],
      ['Proving', '2 hr']
    ]);
  });

  it('shows the ingredients, ungrouped lines first and then each group under its name, and the method as numbered steps', async () => {
    server.use(http.get('/api/recipes/:slug/', () => HttpResponse.json<Recipe>(withIngredientsAndMethod)));

    renderRoute('/recipes/shakshuka');

    const ingredients = await screen.findByRole('region', { name: 'Ingredients' });
    expect(
      within(ingredients)
        .getAllByRole('heading', { level: 3 })
        .map((heading) => heading.textContent)
    ).toEqual(['For the sauce', 'To serve']);
    expect(within(ingredients).getAllByRole('list').map(itemsOf)).toEqual([
      ['Olive oil 1.5 tbsp', 'Eggs 2–3', 'Salt, to taste'],
      ['Onion, finely chopped 1', 'Garlic, crushed 2 cloves', 'Chopped tomatoes 1 tin'],
      ['Coriander (optional) handful']
    ]);
    const method = screen.getByRole('region', { name: 'Method' });
    const steps = within(method).getByRole('list');
    expect(steps.tagName).toBe('OL');
    expect(stepsOf(steps)).toEqual([
      'Fry the onion in the oil until soft.',
      'Add the garlic and tomatoes and simmer for 10 minutes.',
      'Crack in the eggs, cover and cook until set.'
    ]);
  });

  it('scales every ingredient amount as the servings change, rounded to what can be measured', async () => {
    server.use(http.get('/api/recipes/:slug/', () => HttpResponse.json<Recipe>(withIngredientsAndMethod)));

    renderRoute('/recipes/shakshuka');

    const ingredients = await screen.findByRole('region', { name: 'Ingredients' });
    const amounts = () => within(ingredients).getAllByRole('list').map(itemsOf);
    // The stepper shows the servings, so the facts line leaves them out.
    expect(paragraphs()).toContain('35 min · Easy · One-pot · Main');
    expect(screen.getByRole('status')).toHaveTextContent('Serves 2');

    await userEvent.click(screen.getByRole('button', { name: 'More servings' }));

    expect(screen.getByRole('status')).toHaveTextContent('Serves 3');
    expect(amounts()).toEqual([
      ['Olive oil 2.25 tbsp', 'Eggs 3–5', 'Salt, to taste'],
      ['Onion, finely chopped 1–2', 'Garlic, crushed 3 cloves', 'Chopped tomatoes 1–2 tins'],
      ['Coriander (optional) handful']
    ]);

    await userEvent.click(screen.getByRole('button', { name: 'Fewer servings' }));
    await userEvent.click(screen.getByRole('button', { name: 'Fewer servings' }));

    expect(screen.getByRole('status')).toHaveTextContent('Serves 1');
    expect(screen.getByRole('button', { name: 'Fewer servings' })).toHaveAttribute('aria-disabled', 'true');

    await userEvent.click(screen.getByRole('button', { name: 'Fewer servings' }));

    expect(screen.getByRole('status')).toHaveTextContent('Serves 1');
    expect(amounts()).toEqual([
      ['Olive oil 0.75 tbsp', 'Eggs 1–2', 'Salt, to taste'],
      ['Onion, finely chopped 1', 'Garlic, crushed 1 clove', 'Chopped tomatoes 1 tin'],
      ['Coriander (optional) handful']
    ]);
  });

  it('scales the amounts by the yield for a recipe that makes a number of something', async () => {
    server.use(
      http.get('/api/recipes/:slug/', () =>
        HttpResponse.json<Recipe>({
          ...shakshuka,
          servings: null,
          yield_amount: 16,
          yield_unit: 'cookies',
          ingredient_lines: [
            line(1, 'butter', { amount: 125, unit: 'g' }),
            line(2, 'bicarbonate of soda', { amount: 0.5, unit: 'tsp' }),
            line(3, 'salt', { amount: 1, unit: 'pinch' })
          ]
        })
      )
    );

    renderRoute('/recipes/shakshuka');

    const ingredients = await screen.findByRole('region', { name: 'Ingredients' });
    expect(paragraphs()).toContain('35 min · Easy · One-pot · Main');
    expect(screen.getByRole('status')).toHaveTextContent('Makes 16 cookies');

    await userEvent.click(screen.getByRole('button', { name: 'Make more' }));

    expect(screen.getByRole('status')).toHaveTextContent('Makes 17 cookies');
    expect(itemsOf(within(ingredients).getByRole('list'))).toEqual([
      'Butter 135 g',
      'Bicarbonate of soda 0.5 tsp',
      'Salt 1 pinch'
    ]);
  });

  it('opens in metric with small volumes in spoons, and switches to US customary for amounts and oven temperatures', async () => {
    server.use(
      http.get('/api/recipes/:slug/', () =>
        HttpResponse.json<Recipe>({
          ...shakshuka,
          ingredient_lines: [
            line(1, 'vanilla extract', { amount: 5, unit: 'ml' }),
            line(2, 'plain flour', { amount: 1, unit: 'cup' }),
            line(3, 'butter', { amount: 200, unit: 'g', note: 'softened' }),
            line(4, 'garlic', { amount: 2, unit: 'clove' }),
            line(5, 'salt', { amount: 1, unit: 'pinch' })
          ],
          steps: [
            { id: 1, text: 'Heat the oven to 180°C (160°C fan).' },
            { id: 2, text: 'Rub 200 g of the butter into the flour.' }
          ]
        })
      )
    );

    renderRoute('/recipes/shakshuka');

    const ingredients = await screen.findByRole('region', { name: 'Ingredients' });
    const amounts = () => itemsOf(within(ingredients).getByRole('list'));
    const steps = () => stepsOf(within(screen.getByRole('region', { name: 'Method' })).getByRole('list'));
    const units = screen.getByRole('group', { name: 'Units' });
    expect(within(units).getByRole('radio', { name: 'Metric' })).toBeChecked();
    expect(amounts()).toEqual([
      'Vanilla extract 1 tsp',
      'Plain flour 240 ml',
      'Butter, softened 200 g',
      'Garlic 2 cloves',
      'Salt 1 pinch'
    ]);
    expect(steps()).toEqual(['Heat the oven to 180°C (160°C fan).', 'Rub 200 g of the butter into the flour.']);
    // Written by hand, so there's no original that differs.
    expect(screen.queryByRole('button', { name: 'Show original' })).not.toBeInTheDocument();

    await userEvent.click(within(units).getByRole('radio', { name: 'US' }));

    expect(within(units).getByRole('radio', { name: 'US' })).toBeChecked();
    expect(amounts()).toEqual([
      'Vanilla extract 1 tsp',
      'Plain flour 1 cup',
      'Butter, softened 7 oz',
      'Garlic 2 cloves',
      'Salt 1 pinch'
    ]);
    expect(steps()).toEqual(['Heat the oven to 355°F (320°F fan).', 'Rub 200 g of the butter into the flour.']);

    await userEvent.click(screen.getByRole('button', { name: 'More servings' }));

    expect(amounts()).toEqual([
      'Vanilla extract 1.5 tsp',
      'Plain flour 1.5 cups',
      'Butter, softened 10.5 oz',
      'Garlic 3 cloves',
      'Salt 1–2 pinches'
    ]);

    await userEvent.click(within(units).getByRole('radio', { name: 'Metric' }));

    expect(amounts()).toEqual([
      'Vanilla extract 1.5 tsp',
      'Plain flour 360 ml',
      'Butter, softened 300 g',
      'Garlic 3 cloves',
      'Salt 1–2 pinches'
    ]);
    expect(steps()).toEqual(['Heat the oven to 180°C (160°C fan).', 'Rub 200 g of the butter into the flour.']);
  });

  it.each([
    ['metric', 'Metric', 'Plain flour 240 ml'],
    ['us', 'US', 'Plain flour 1 cup']
  ] as const)("opens in a signed-in account's units, %s", async (unitSystem, radio, flour) => {
    const saves = answerSignedIn(unitSystem);

    renderRoute('/recipes/shakshuka');

    const ingredients = await screen.findByRole('region', { name: 'Ingredients' });
    const units = screen.getByRole('group', { name: 'Units' });
    expect(within(units).getByRole('radio', { name: radio })).toBeChecked();
    expect(itemsOf(within(ingredients).getByRole('list'))).toEqual([flour]);
    expect(saves).toEqual([]);
  });

  it('opens in metric when signed out', async () => {
    server.use(http.get('/api/recipes/:slug/', () => HttpResponse.json<Recipe>(withFlour)));
    const { queryClient } = renderRoute('/recipes/shakshuka');

    const units = await screen.findByRole('group', { name: 'Units' });
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));
    expect(within(units).getByRole('radio', { name: 'Metric' })).toBeChecked();
    expect(within(units).getByRole('radio', { name: 'US' })).not.toBeChecked();
  });

  it("opens in metric when the session can't be checked", async () => {
    server.use(
      http.get('/api/recipes/:slug/', () => HttpResponse.json<Recipe>(withFlour)),
      http.get('/api/account/', () => new HttpResponse(null, { status: 500 }))
    );

    renderRoute('/recipes/shakshuka');

    expect(await screen.findByRole('heading', { level: 1, name: 'Shakshuka' })).toBeInTheDocument();
    const units = screen.getByRole('group', { name: 'Units' });
    expect(within(units).getByRole('radio', { name: 'Metric' })).toBeChecked();
  });

  it('switches units for this visit only, without saving them on the account', async () => {
    const saves = answerSignedIn('us');
    const { queryClient } = renderRoute('/recipes/shakshuka');

    const units = await screen.findByRole('group', { name: 'Units' });
    await userEvent.click(within(units).getByRole('radio', { name: 'Metric' }));

    expect(within(units).getByRole('radio', { name: 'Metric' })).toBeChecked();
    expect(screen.getByText('240 ml')).toBeInTheDocument();
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
    expect(saves).toEqual([]);
  });

  it('shows the amounts and method as the source wrote them, offered only while they differ from what is shown', async () => {
    server.use(
      http.get('/api/recipes/:slug/', () =>
        HttpResponse.json<Recipe>({
          ...shakshuka,
          ingredient_lines: [
            line(1, 'plain flour', { amount: 1, unit: 'cup', original_text: '1 cup plain flour' }),
            line(2, 'eggs', { amount: 2, original_text: '2 eggs' }),
            line(3, 'chives', { optional: true })
          ],
          steps: [{ id: 1, text: 'Heat the oven to 350°F.' }]
        })
      )
    );

    renderRoute('/recipes/shakshuka');

    const ingredients = await screen.findByRole('region', { name: 'Ingredients' });
    const amounts = () => itemsOf(within(ingredients).getByRole('list'));
    const steps = () => stepsOf(within(screen.getByRole('region', { name: 'Method' })).getByRole('list'));
    const showOriginal = () => screen.queryByRole('button', { name: 'Show original' });
    expect(amounts()).toEqual(['Plain flour 240 ml', 'Eggs 2', 'Chives (optional)']);
    expect(steps()).toEqual(['Heat the oven to 175°C.']);
    expect(showOriginal()).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(screen.getByRole('button', { name: 'Show original' }));

    expect(showOriginal()).toHaveAttribute('aria-pressed', 'true');
    // As the source wrote it, with no amount drawn apart; a line written by hand reads as before.
    expect(amounts()).toEqual(['1 cup plain flour', '2 eggs', 'Chives (optional)']);
    expect(within(ingredients).getAllByRole('listitem')[0]?.textContent).toBe('1 cup plain flour');
    expect(steps()).toEqual(['Heat the oven to 350°F.']);

    // US customary reads the same as the original, so there's nothing different to show.
    await userEvent.click(screen.getByRole('radio', { name: 'US' }));

    expect(amounts()).toEqual(['Plain flour 1 cup', 'Eggs 2', 'Chives (optional)']);
    expect(steps()).toEqual(['Heat the oven to 350°F.']);
    expect(showOriginal()).not.toBeInTheDocument();
  });

  it('reads a dry good in cups as grams in metric, until Cups to grams is turned off', async () => {
    server.use(
      http.get('/api/recipes/:slug/', () =>
        HttpResponse.json<Recipe>({
          ...shakshuka,
          ingredient_lines: [
            line(1, 'plain flour', { amount: 1, unit: 'cup', ingredient: plainFlour }),
            line(2, 'milk', { amount: 1, unit: 'cup' }),
            line(3, 'caster sugar', {
              amount: 2,
              unit: 'tbsp',
              ingredient: { slug: 'caster-sugar', name: 'caster sugar', grams_per_cup: 200 }
            })
          ]
        })
      )
    );

    renderRoute('/recipes/shakshuka');

    const ingredients = await screen.findByRole('region', { name: 'Ingredients' });
    const amounts = () => itemsOf(within(ingredients).getByRole('list'));
    const crossing = () => screen.getByRole('button', { name: 'Cups to grams' });
    expect(amounts()).toEqual(['Plain flour 125 g', 'Milk 240 ml', 'Caster sugar 2 tbsp']);
    expect(crossing()).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(crossing());

    expect(amounts()).toEqual(['Plain flour 240 ml', 'Milk 240 ml', 'Caster sugar 2 tbsp']);
    expect(crossing()).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(crossing());

    expect(amounts()[0]).toBe('Plain flour 125 g');
  });

  it('reads a dry good in grams as cups in US customary, scaled with the servings', async () => {
    server.use(
      http.get('/api/recipes/:slug/', () =>
        HttpResponse.json<Recipe>({
          ...shakshuka,
          ingredient_lines: [
            line(1, 'plain flour', { amount: 125, unit: 'g', ingredient: plainFlour }),
            line(2, 'milk', { amount: 1, unit: 'cup' })
          ]
        })
      )
    );

    renderRoute('/recipes/shakshuka');

    const ingredients = await screen.findByRole('region', { name: 'Ingredients' });
    const amounts = () => itemsOf(within(ingredients).getByRole('list'));
    await userEvent.click(screen.getByRole('radio', { name: 'US' }));

    expect(screen.getByRole('button', { name: 'Grams to cups' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: 'Cups to grams' })).not.toBeInTheDocument();
    expect(amounts()[0]).toBe('Plain flour 1 cup');

    await userEvent.click(screen.getByRole('button', { name: 'More servings' }));

    expect(amounts()[0]).toBe('Plain flour 1.5 cups');
  });

  it('offers Cups to grams only while turning it off would change an amount', async () => {
    server.use(
      http.get('/api/recipes/:slug/', () =>
        HttpResponse.json<Recipe>({
          ...shakshuka,
          ingredient_lines: [line(1, 'plain flour', { amount: 200, unit: 'g', ingredient: plainFlour })]
        })
      )
    );
    const { queryClient } = renderRoute('/recipes/shakshuka');

    const ingredients = await screen.findByRole('region', { name: 'Ingredients' });
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));
    expect(itemsOf(within(ingredients).getByRole('list'))).toEqual(['Plain flour 200 g']);
    expect(screen.queryByRole('button', { name: 'Cups to grams' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('radio', { name: 'US' }));

    expect(screen.getByRole('button', { name: 'Grams to cups' })).toBeInTheDocument();
  });

  it('turns Show original off when Cups to grams is pressed', async () => {
    server.use(
      http.get('/api/recipes/:slug/', () =>
        HttpResponse.json<Recipe>({
          ...shakshuka,
          ingredient_lines: [
            line(1, 'plain flour', {
              amount: 1,
              unit: 'cup',
              original_text: '1 cup plain flour',
              ingredient: plainFlour
            })
          ]
        })
      )
    );

    renderRoute('/recipes/shakshuka');

    const ingredients = await screen.findByRole('region', { name: 'Ingredients' });
    const amounts = () => itemsOf(within(ingredients).getByRole('list'));
    await userEvent.click(screen.getByRole('button', { name: 'Show original' }));

    expect(amounts()).toEqual(['1 cup plain flour']);

    await userEvent.click(screen.getByRole('button', { name: 'Cups to grams' }));

    expect(screen.getByRole('button', { name: 'Show original' })).toHaveAttribute('aria-pressed', 'false');
    expect(amounts()).toEqual(['Plain flour 240 ml']);
  });

  it.each([
    ['shakshuka', ['Ingredients', 'Method']],
    ['banana-bread', []]
  ])('shows the ingredients and method sections only when the recipe has them (%s)', async (slug, headings) => {
    server.use(http.get('/api/recipes/shakshuka/', () => HttpResponse.json<Recipe>(withIngredientsAndMethod)));

    renderRoute(`/recipes/${slug}`);

    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.queryAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual(headings);
  });

  it('joins each ingredient to its amount, scaled with the servings, and shows a line with no amount by name alone', async () => {
    server.use(
      http.get('/api/recipes/:slug/', () =>
        HttpResponse.json<Recipe>({
          ...shakshuka,
          ingredient_lines: [line(1, 'dried chickpeas', { amount: 250, unit: 'g' }), line(2, 'salt')]
        })
      )
    );

    renderRoute('/recipes/shakshuka');

    const ingredients = await screen.findByRole('region', { name: 'Ingredients' });
    expect(itemsOf(within(ingredients).getByRole('list'))).toEqual(['Dried chickpeas 250 g', 'Salt']);

    await userEvent.click(screen.getByRole('button', { name: 'More servings' }));
    await userEvent.click(screen.getByRole('button', { name: 'More servings' }));

    expect(screen.getByRole('status')).toHaveTextContent('Serves 4');
    expect(itemsOf(within(ingredients).getByRole('list'))).toEqual(['Dried chickpeas 500 g', 'Salt']);
  });

  it("reads title, ingredients and method in that order, with no Let's get cooking", async () => {
    server.use(http.get('/api/recipes/:slug/', () => HttpResponse.json<Recipe>(withIngredientsAndMethod)));

    renderRoute('/recipes/shakshuka');

    const title = await screen.findByRole('heading', { level: 1, name: 'Shakshuka' });
    const ingredients = screen.getByRole('heading', { level: 2, name: 'Ingredients' });
    const method = screen.getByRole('heading', { level: 2, name: 'Method' });
    expect(title.compareDocumentPosition(ingredients) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(ingredients.compareDocumentPosition(method) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('button', { name: 'More servings' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Let's get cooking/ })).not.toBeInTheDocument();
  });

  it.each([
    [true, '0'],
    [false, null]
  ])(
    'lets the keyboard reach the ingredients, which scroll inside themselves on a laptop (laptop: %s)',
    async (isLaptop, tabIndex) => {
      setLaptop(isLaptop);
      server.use(http.get('/api/recipes/:slug/', () => HttpResponse.json<Recipe>(withIngredientsAndMethod)));

      renderRoute('/recipes/shakshuka');

      expect((await screen.findByRole('region', { name: 'Ingredients' })).getAttribute('tabindex')).toBe(tabIndex);
    }
  );

  it("says the recipe isn't found for an unknown address", async () => {
    renderRoute('/recipes/no-such-recipe');

    expect(await screen.findByRole('heading', { name: 'Recipe not found' })).toBeInTheDocument();
    expect(screen.getByText("This recipe doesn't exist or has been removed.")).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('Recipe not found · Tastebook'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('shows an alert and a retry when the request fails', async () => {
    failRecipe();

    renderRoute('/recipes/shakshuka');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Couldn't load the recipe");
    expect(alert).toHaveTextContent('Check your connection, then try again.');
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Recipe not found' })).not.toBeInTheDocument();
  });

  it('loads again and shows the recipe when the retry succeeds', async () => {
    failRecipe();
    renderRoute('/recipes/shakshuka');
    const tryAgain = await screen.findByRole('button', { name: 'Try again' });

    const release = holdRecipe(() => HttpResponse.json<Recipe>(shakshuka));
    await userEvent.click(tryAgain);

    expect(await screen.findByRole('button', { name: 'Trying…' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load the recipe");
    expect(screen.queryByText('Opening the recipe…')).not.toBeInTheDocument();

    release();

    expect(await screen.findByRole('heading', { name: 'Shakshuka' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('brings the alert back when the retry fails again', async () => {
    failRecipe();
    renderRoute('/recipes/shakshuka');
    const tryAgain = await screen.findByRole('button', { name: 'Try again' });

    const release = holdRecipe(() => new HttpResponse(null, { status: 503 }));
    await userEvent.click(tryAgain);

    expect(await screen.findByRole('button', { name: 'Trying…' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load the recipe");
    expect(screen.queryByText('Opening the recipe…')).not.toBeInTheDocument();

    release();

    expect(await screen.findByRole('button', { name: 'Try again' })).not.toHaveAttribute('aria-busy');
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load the recipe");
  });

  it.each([
    ['/recipes/apple-tart', 'All recipes', 'What shall we cook tonight?'],
    ['/recipes/no-such-recipe', 'All recipes', 'What shall we cook tonight?']
  ])('from %s, follows "%s" to the list headed "%s"', async (path, linkName, headingName) => {
    renderRoute(path);

    await userEvent.click(screen.getByRole('link', { name: linkName }));

    expect(await screen.findByRole('heading', { level: 1, name: headingName })).toBeInTheDocument();
  });
});
