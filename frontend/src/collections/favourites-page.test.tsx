import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';

import type { components } from '../api/schema';
import { renderRoute } from '../test/render-route';
import { server } from '../test/server';

type CurrentAccount = components['schemas']['CurrentAccount'];
type ListedRecipe = components['schemas']['ListedRecipe'];
type ListSummary = components['schemas']['ListSummary'];
type SavedList = components['schemas']['SavedList'];
type SavedRecipe = components['schemas']['SavedRecipe'];

const listed = (id: number, slug: string, title: string, fields: Partial<ListedRecipe> = {}): ListedRecipe => ({
  id,
  slug,
  visibility: 'public',
  author: null,
  title,
  description: '',
  cuisines: [{ slug: 'korean', name: 'Korean' }],
  difficulty: 'easy',
  total_minutes: 35,
  photo: null,
  diet_tags: [],
  ...fields
});

const bibimbap: SavedRecipe = {
  id: 14,
  title: 'Bibimbap',
  saved_at: '2026-11-07T12:00:00Z',
  recipe: listed(3, 'bibimbap', 'Bibimbap')
};
const shakshuka: SavedRecipe = {
  id: 13,
  title: 'Shakshuka',
  saved_at: '2026-11-06T12:00:00Z',
  recipe: listed(4, 'shakshuka', 'Shakshuka', { author: 'Sam', cuisines: [], total_minutes: 30 })
};
const curry: SavedRecipe = { id: 12, title: 'Grandma’s curry', saved_at: '2026-11-05T12:00:00Z', recipe: null };

const signedIn = (isSignedIn: () => boolean = () => true) =>
  server.use(
    http.get('/api/account/', () =>
      HttpResponse.json<CurrentAccount>({
        account: isSignedIn() ? { email: 'milo@example.com', name: 'Milo', unit_system: 'metric' } : null
      })
    )
  );

const answerFavourites = (savedRecipes: SavedRecipe[]) => {
  const shown = { savedRecipes };
  server.use(
    http.get('/api/lists/favourites/', () =>
      HttpResponse.json<SavedList>({ slug: 'favourites', name: 'Favourites', saved_recipes: shown.savedRecipes })
    )
  );
  return shown;
};

const hearts = () => screen.getAllByRole('button', { name: /^Favourite / });

const captions = () => screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent);

// Sonner's buttons take a pointer jsdom can't capture, so they're pressed from the keyboard.
const pressToastButton = async (name: string) => {
  const button = await screen.findByRole('button', { name });
  act(() => button.focus());
  await userEvent.keyboard('{Enter}');
};

describe('signed out', () => {
  it.each(['/lists', '/lists/favourites'])('%s goes to sign in and back', async (path) => {
    const { router } = renderRoute(path);

    await waitFor(() =>
      expect(router.state.location.pathname + router.state.location.search).toBe(
        `/sign-in?next=${encodeURIComponent(path)}`
      )
    );
  });
});

describe('the Lists page', () => {
  it('shows Favourites, even before anything is saved', async () => {
    signedIn();
    renderRoute('/lists');

    const row = await screen.findByRole('link', { name: /Favourites/ });

    expect(row).toHaveTextContent('FavouritesNothing saved yet');
    expect(row).toHaveAttribute('href', '/lists/favourites');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Your lists');
  });

  it.each<[number, string]>([
    [1, 'Favourites1 recipe'],
    [4, 'Favourites4 recipes']
  ])('counts %i saved recipes', async (count, text) => {
    signedIn();
    server.use(
      http.get('/api/lists/', () =>
        HttpResponse.json<ListSummary[]>([
          { slug: 'favourites', name: 'Favourites', recipe_count: count, covers: [{ id: 3, photo: null }] }
        ])
      )
    );
    renderRoute('/lists');

    expect(await screen.findByRole('link', { name: /Favourites/ })).toHaveTextContent(text);
  });

  it('says when the lists could not load, and tries again', async () => {
    signedIn();
    const state = { fails: true };
    server.use(
      http.get('/api/lists/', () =>
        state.fails
          ? new HttpResponse(null, { status: 500 })
          : HttpResponse.json<ListSummary[]>([{ slug: 'favourites', name: 'Favourites', recipe_count: 0, covers: [] }])
      )
    );
    renderRoute('/lists');

    expect(await screen.findByText("Couldn't load your lists")).toBeInTheDocument();
    expect(screen.queryByText('Finding your lists…')).not.toBeInTheDocument();
    state.fails = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('link', { name: /Favourites/ })).toBeInTheDocument();
  });
});

describe('the Favourites page', () => {
  it('shows the saved recipes newest first, an unavailable one by the title it was saved with', async () => {
    signedIn();
    answerFavourites([bibimbap, shakshuka, curry]);
    renderRoute('/lists/favourites');

    expect(await screen.findByText('3 recipes')).toBeInTheDocument();
    expect(captions()).toEqual(['Bibimbap', 'Shakshuka', 'Grandma’s curry']);
    expect(screen.getByRole('link', { name: 'Bibimbap' })).toHaveAccessibleDescription('35 min · Easy · Korean');
    expect(screen.getByRole('link', { name: 'Shakshuka' })).toHaveAccessibleDescription('by Sam 30 min · Easy');
    // Not a link: there's nothing to open.
    expect(screen.queryByRole('link', { name: 'Grandma’s curry' })).not.toBeInTheDocument();
    expect(screen.getByText('Made private or deleted')).toBeInTheDocument();
    expect(hearts().map((heart) => [heart.getAttribute('aria-label'), heart.getAttribute('aria-pressed')])).toEqual([
      ['Favourite Bibimbap', 'true'],
      ['Favourite Shakshuka', 'true'],
      ['Favourite Grandma’s curry', 'true']
    ]);
    expect(screen.getByRole('link', { name: 'All lists' })).toHaveAttribute('href', '/lists');
  });

  it('offers a way to recipes when nothing is saved', async () => {
    signedIn();
    renderRoute('/lists/favourites');

    expect(await screen.findByRole('heading', { level: 2, name: 'Nothing saved yet' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Browse recipes' })).toHaveAttribute('href', '/recipes');
  });

  it('says when Favourites could not load', async () => {
    signedIn();
    server.use(http.get('/api/lists/favourites/', () => HttpResponse.error()));
    renderRoute('/lists/favourites');

    expect(await screen.findByText("Couldn't load your favourites")).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Favourites');
  });

  it('opens a recipe with its way back to Favourites', async () => {
    signedIn();
    answerFavourites([bibimbap]);
    server.use(
      http.get('/api/recipes/:slug/', () =>
        HttpResponse.json<components['schemas']['Recipe']>({
          ...(bibimbap.recipe as ListedRecipe),
          adapted_from: null,
          courses: [],
          prep_minutes: 15,
          cook_minutes: 20,
          extra_minutes: 0,
          extra_label: '',
          servings: 2,
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
          can_delete: false,
          can_edit: false,
          can_publish: false,
          save_count: null
        })
      )
    );
    renderRoute('/lists/favourites');

    await userEvent.click(await screen.findByRole('link', { name: 'Bibimbap' }));
    await userEvent.click(await screen.findByRole('link', { name: 'Favourites' }));

    expect(await screen.findByText('1 recipe')).toBeInTheDocument();
  });
});

// Answers each DELETE with `answer` and each restore with `restore`, recording what was sent.
const answerUnsaving = (
  answer: () => Response | Promise<Response>,
  restore: () => Response = () => HttpResponse.json<SavedRecipe>(shakshuka, { status: 201 })
) => {
  const sent: string[] = [];
  server.use(
    http.delete('/api/lists/favourites/saved/:id/', ({ params }) => {
      sent.push(`DELETE ${params.id}`);
      return answer();
    }),
    http.post('/api/lists/favourites/saved/restore/', async ({ request }) => {
      sent.push(`RESTORE ${((await request.json()) as { undo: string }).undo}`);
      return restore();
    })
  );
  return sent;
};

const unsaved = () => HttpResponse.json({ undo: 'token-13' });

describe('unsaving from Favourites', () => {
  it('takes the card away at once, moves focus to the next heart, and puts it back in its place on Undo', async () => {
    signedIn();
    const shown = answerFavourites([bibimbap, shakshuka, curry]);
    const sent = answerUnsaving(unsaved);
    renderRoute('/lists/favourites');
    await screen.findByText('3 recipes');

    await userEvent.click(screen.getByRole('button', { name: 'Favourite Shakshuka' }));

    expect(captions()).toEqual(['Bibimbap', 'Grandma’s curry']);
    expect(screen.getByText('2 recipes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Favourite Grandma’s curry' })).toHaveFocus();
    expect(await screen.findByText('Removed from Favourites')).toBeInTheDocument();

    shown.savedRecipes = [bibimbap, shakshuka, curry];
    await pressToastButton('Undo');

    await waitFor(() => expect(captions()).toEqual(['Bibimbap', 'Shakshuka', 'Grandma’s curry']));
    expect(sent).toEqual(['DELETE 13', 'RESTORE token-13']);
  });

  it('moves focus to the heading when the last card goes', async () => {
    signedIn();
    answerFavourites([curry]);
    answerUnsaving(unsaved);
    renderRoute('/lists/favourites');

    await userEvent.click(await screen.findByRole('button', { name: 'Favourite Grandma’s curry' }));

    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus();
    expect(screen.getByRole('heading', { level: 2, name: 'Nothing saved yet' })).toBeInTheDocument();
  });

  it('leaves the card gone when it had already been taken out', async () => {
    signedIn();
    const shown = answerFavourites([bibimbap, shakshuka]);
    answerUnsaving(() => {
      shown.savedRecipes = [bibimbap];
      return new HttpResponse(null, { status: 404 });
    });
    const { queryClient } = renderRoute('/lists/favourites');
    await screen.findByText('2 recipes');

    await userEvent.click(screen.getByRole('button', { name: 'Favourite Shakshuka' }));

    await waitFor(() => expect(queryClient.isFetching() + queryClient.isMutating()).toBe(0));
    expect(captions()).toEqual(['Bibimbap']);
    expect(screen.queryByText("Couldn't remove it. Check your connection.")).not.toBeInTheDocument();
  });

  it.each<[string, () => Response]>([
    ['refused while still signed in', () => new HttpResponse(null, { status: 403 })],
    ['answered with a server error', () => new HttpResponse(null, { status: 500 })],
    ['not answered', () => HttpResponse.error()]
  ])('puts the card back and says so when the unsave is %s', async (_, answer) => {
    signedIn();
    answerFavourites([bibimbap, shakshuka]);
    const sent = answerUnsaving(answer);
    renderRoute('/lists/favourites');
    await screen.findByText('2 recipes');

    await userEvent.click(screen.getByRole('button', { name: 'Favourite Shakshuka' }));

    expect(await screen.findByText("Couldn't remove it. Check your connection.")).toBeInTheDocument();
    expect(captions()).toEqual(['Bibimbap', 'Shakshuka']);
    await pressToastButton('Try again');
    await waitFor(() => expect(sent).toEqual(['DELETE 13', 'DELETE 13']));
  });

  it('sends you to sign in when Tastebook says you are signed out', async () => {
    const state = { signedOut: false };
    signedIn(() => !state.signedOut);
    answerFavourites([shakshuka]);
    answerUnsaving(() => {
      state.signedOut = true;
      return new HttpResponse(null, { status: 403 });
    });
    const { router } = renderRoute('/lists/favourites');

    await userEvent.click(await screen.findByRole('button', { name: 'Favourite Shakshuka' }));

    await waitFor(() =>
      expect(router.state.location.pathname + router.state.location.search).toBe('/sign-in?next=%2Flists%2Ffavourites')
    );
  });

  it.each<[string, () => Response, string]>([
    ['too late', () => new HttpResponse(null, { status: 400 }), "That can't be undone any more."],
    [
      'refused while still signed in',
      () => new HttpResponse(null, { status: 403 }),
      "Couldn't put it back. Check your connection."
    ],
    ['not answered', () => HttpResponse.error(), "Couldn't put it back. Check your connection."]
  ])('says so when Undo is %s', async (_, restore, said) => {
    signedIn();
    answerFavourites([shakshuka]);
    answerUnsaving(unsaved, restore);
    renderRoute('/lists/favourites');
    await userEvent.click(await screen.findByRole('button', { name: 'Favourite Shakshuka' }));

    await pressToastButton('Undo');

    expect(await screen.findByText(said)).toBeInTheDocument();
    expect(within(screen.getByRole('main')).queryByRole('link', { name: 'Shakshuka' })).not.toBeInTheDocument();
  });
});
