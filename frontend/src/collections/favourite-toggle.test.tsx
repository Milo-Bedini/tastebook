import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';

import type { components } from '../api/schema';
import { renderRoute } from '../test/render-route';
import { server } from '../test/server';

type CurrentAccount = components['schemas']['CurrentAccount'];
type SavedList = components['schemas']['SavedList'];
type SavedRecipe = components['schemas']['SavedRecipe'];

const appleTart: SavedRecipe = {
  id: 21,
  title: 'Apple tart',
  saved_at: '2026-11-07T12:00:00Z',
  recipe: {
    id: 1,
    slug: 'apple-tart',
    visibility: 'public',
    author: null,
    title: 'Apple tart',
    description: 'Sharp apples on buttery pastry.',
    cuisines: [{ slug: 'french', name: 'French' }],
    difficulty: 'medium',
    total_minutes: 100,
    photo: null,
    diet_tags: [],
    hidden_for_review: false,
    waiting_for_review: false
  }
};

const signedIn = (isSignedIn: () => boolean = () => true) =>
  server.use(
    http.get('/api/account/', () =>
      HttpResponse.json<CurrentAccount>({
        account: isSignedIn() ? { email: 'milo@example.com', name: 'Milo', unit_system: 'metric' } : null
      })
    )
  );

const answerFavourites = (savedRecipes: SavedRecipe[]) =>
  server.use(
    http.get('/api/lists/favourites/', () =>
      HttpResponse.json<SavedList>({
        slug: 'favourites',
        name: 'Favourites',
        scope: 'personal',
        household_name: null,
        saved_recipes: savedRecipes
      })
    )
  );

// Answers each save with `answer`, recording each body sent, and each unsave with an Undo token.
const answerSaving = (answer: () => Response | Promise<Response>) => {
  const sent: string[] = [];
  server.use(
    http.post('/api/lists/favourites/saved/', async ({ request }) => {
      sent.push(`POST ${((await request.json()) as { recipe: string }).recipe}`);
      return answer();
    }),
    http.delete('/api/lists/saved/:id/', ({ params }) => {
      sent.push(`DELETE ${params.id}`);
      return HttpResponse.json({ undo: 'a-token' });
    })
  );
  return sent;
};

const saved = () => HttpResponse.json<SavedRecipe>(appleTart, { status: 201 });

const heart = () => screen.getByRole('button', { name: 'Favourite' });

const pressToastButton = async (name: string) => {
  const button = await screen.findByRole('button', { name });
  act(() => button.focus());
  await userEvent.keyboard('{Enter}');
};

const openRecipe = async () => {
  const rendered = renderRoute('/recipes/apple-tart');
  await screen.findByRole('heading', { level: 1, name: 'Apple tart' });
  await waitFor(() => expect(heart()).not.toHaveAttribute('aria-busy'));
  return rendered;
};

describe("the heart on a recipe's page", () => {
  it('saves at once, says so, and Undo takes it out again', async () => {
    signedIn();
    const sent = answerSaving(saved);
    await openRecipe();
    expect(heart()).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(heart());

    expect(heart()).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByText('Saved to Favourites')).toBeInTheDocument();
    await pressToastButton('Undo');
    await waitFor(() => expect(heart()).toHaveAttribute('aria-pressed', 'false'));
    expect(sent).toEqual(['POST apple-tart', 'DELETE 21']);
  });

  it('is busy until the save is answered, and ignores presses meanwhile', async () => {
    signedIn();
    const gate = { release: () => {} };
    const released = new Promise<void>((resolve) => {
      gate.release = resolve;
    });
    const sent = answerSaving(async () => {
      await released;
      return saved();
    });
    await openRecipe();

    await userEvent.click(heart());
    await userEvent.click(heart());

    expect(heart()).toHaveAttribute('aria-busy', 'true');
    expect(heart()).toHaveAttribute('aria-pressed', 'true');
    gate.release();
    await waitFor(() => expect(heart()).not.toHaveAttribute('aria-busy'));
    expect(sent).toEqual(['POST apple-tart']);
  });

  it('shows a saved recipe saved, and unsaves it with Undo', async () => {
    signedIn();
    answerFavourites([appleTart]);
    const sent = answerSaving(saved);
    await openRecipe();
    expect(heart()).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(heart());

    expect(heart()).toHaveAttribute('aria-pressed', 'false');
    expect(await screen.findByText('Removed from Favourites')).toBeInTheDocument();
    expect(sent).toEqual(['DELETE 21']);
  });

  it.each<[string, () => Response]>([
    ['refused while still signed in', () => new HttpResponse(null, { status: 403 })],
    ['refused for a missing recipe slug', () => new HttpResponse(null, { status: 400 })],
    ['answered with a server error', () => new HttpResponse(null, { status: 500 })],
    ['not answered', () => HttpResponse.error()]
  ])('turns back and offers to try again when the save is %s', async (_, answer) => {
    signedIn();
    const sent = answerSaving(answer);
    await openRecipe();

    await userEvent.click(heart());

    expect(await screen.findByText("Couldn't save. Check your connection.")).toBeInTheDocument();
    expect(heart()).toHaveAttribute('aria-pressed', 'false');
    await pressToastButton('Try again');
    await waitFor(() => expect(sent).toEqual(['POST apple-tart', 'POST apple-tart']));
  });

  it('says so when the recipe has gone', async () => {
    signedIn();
    answerSaving(() => new HttpResponse(null, { status: 404 }));
    await openRecipe();

    await userEvent.click(heart());

    expect(await screen.findByText("This recipe isn't available any more.")).toBeInTheDocument();
    expect(heart()).toHaveAttribute('aria-pressed', 'false');
  });

  it('sends you to sign in, to save on the way back, when Tastebook says you are signed out', async () => {
    const state = { signedOut: false };
    signedIn(() => !state.signedOut);
    answerSaving(() => {
      state.signedOut = true;
      return new HttpResponse(null, { status: 403 });
    });
    const { router } = await openRecipe();

    await userEvent.click(heart());

    await waitFor(() =>
      expect(router.state.location.pathname + router.state.location.search).toBe(
        '/sign-in?next=%2Frecipes%2Fapple-tart%3Fsave%3Dapple-tart'
      )
    );
  });
});

describe('signed out', () => {
  it('sends a press through sign in', async () => {
    const { router } = await openRecipe();

    await userEvent.click(heart());

    expect(router.state.location.pathname + router.state.location.search).toBe(
      '/sign-in?next=%2Frecipes%2Fapple-tart%3Fsave%3Dapple-tart'
    );
  });

  it('saves on the way back from signing in, once', async () => {
    signedIn();
    const sent = answerSaving(saved);
    const { router } = renderRoute('/recipes/apple-tart?save=apple-tart');

    expect(await screen.findByText('Signed in. Saved to Favourites')).toBeInTheDocument();
    expect(router.state.location.search).toBe('');
    expect(sent).toEqual(['POST apple-tart']);
  });
});

describe('the hearts on the recipe list', () => {
  it('name each recipe and show which are saved', async () => {
    signedIn();
    answerFavourites([appleTart]);
    const { queryClient } = renderRoute('/recipes');
    await screen.findByRole('link', { name: 'Apple tart' });
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));

    expect(
      screen
        .getAllByRole('button', { name: /^Favourite / })
        .map((button) => [button.getAttribute('aria-label'), button.getAttribute('aria-pressed')])
    ).toEqual([
      ['Favourite Apple tart', 'true'],
      ['Favourite Banana bread', 'false']
    ]);
  });

  it("are busy one at a time: saving one card doesn't hold up another", async () => {
    signedIn();
    answerFavourites([]);
    const gate = { release: () => {} };
    const released = new Promise<void>((resolve) => {
      gate.release = resolve;
    });
    const sent = answerSaving(async () => {
      await released;
      return saved();
    });
    renderRoute('/recipes');
    const appleHeart = await screen.findByRole('button', { name: 'Favourite Apple tart' });
    const bananaHeart = screen.getByRole('button', { name: 'Favourite Banana bread' });
    await waitFor(() => expect(appleHeart).not.toHaveAttribute('aria-busy'));

    await userEvent.click(appleHeart);

    expect(appleHeart).toHaveAttribute('aria-busy', 'true');
    expect(appleHeart).toHaveAttribute('aria-pressed', 'true');
    expect(bananaHeart).not.toHaveAttribute('aria-busy');
    expect(bananaHeart).toHaveAttribute('aria-pressed', 'false');
    gate.release();
    await waitFor(() => expect(appleHeart).not.toHaveAttribute('aria-busy'));
    expect(sent).toEqual(['POST apple-tart']);
  });
});

describe('the tabs', () => {
  it('show Recipes and Lists once signed in, with Lists current under /lists', async () => {
    signedIn();
    renderRoute('/lists/favourites');

    // The top bar's and the dock's: CSS shows one or the other by width.
    const lists = await screen.findAllByRole('link', { name: 'Lists' });
    expect(lists.map((link) => link.getAttribute('aria-current'))).toEqual(['page', 'page']);
    expect(screen.getAllByRole('link', { name: 'Recipes' }).map((link) => link.getAttribute('href'))).toEqual([
      '/recipes',
      '/recipes'
    ]);
  });

  it('are left out signed out', async () => {
    const { queryClient } = renderRoute('/recipes');
    await screen.findByRole('link', { name: 'Sign in' });
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));

    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();
  });
});
