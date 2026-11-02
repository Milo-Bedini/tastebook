import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';

import type { components } from '../api/schema';
import { renderRoute } from '../test/render-route';
import { server } from '../test/server';

type CurrentAccount = components['schemas']['CurrentAccount'];
type RecipeSummary = components['schemas']['RecipeSummary'];

const appleTart: RecipeSummary = {
  id: 1,
  slug: 'apple-tart',
  title: 'Apple tart',
  description: 'Sharp apples on buttery pastry.',
  cuisines: [{ slug: 'french', name: 'French' }],
  difficulty: 'medium',
  total_minutes: 100,
  photo: null,
  diet_tags: []
};

// Answers only a search for "tart", so the list shows a recipe only once the search reached it.
const answerTartSearch = () =>
  server.use(
    http.get('/api/recipes/', ({ request }) =>
      HttpResponse.json<RecipeSummary[]>(new URL(request.url).searchParams.get('q') === 'tart' ? [appleTart] : [])
    )
  );

const searchBox = () => screen.getByRole('searchbox', { name: 'Search recipes' });

const searchButton = () => screen.getByRole('button', { name: 'Search recipes' });

const ACCOUNT = '/api/account/';

const SESSION = '/api/_allauth/browser/v1/auth/session';

const currentAccount = (email?: string) =>
  HttpResponse.json<CurrentAccount>({
    account: email === undefined ? null : { email, name: 'Sam', unit_system: 'metric' }
  });

// allauth answers a sign out with 401: nobody is signed in now.
const signedOut = () =>
  HttpResponse.json({ status: 401, data: { flows: [] }, meta: { is_authenticated: false } }, { status: 401 });

// Signed in until a DELETE signs out, which is recorded.
const answerSignedIn = () => {
  const signOuts: string[] = [];
  server.use(
    http.get(ACCOUNT, () => currentAccount(signOuts.length > 0 ? undefined : 'sam@example.com')),
    http.delete(SESSION, ({ request }) => {
      signOuts.push(new URL(request.url).pathname);
      return signedOut();
    })
  );
  return signOuts;
};

describe('AppLayout', () => {
  it.each(['/', '/recipes', '/recipes/apple-tart', '/no-such-page'])(
    'shows the top bar with the wordmark linking home on %s',
    (path) => {
      renderRoute(path);

      // getByRole fails on a second banner, so there's exactly one.
      const banner = screen.getByRole('banner');
      expect(within(banner).getByRole('link', { name: 'Tastebook' })).toHaveAttribute('href', '/');
    }
  );

  it('opens the recipe list with the search typed on a recipe', async () => {
    answerTartSearch();
    const { router } = renderRoute('/recipes/apple-tart');
    await screen.findByRole('heading', { level: 1, name: 'Apple tart' });

    await userEvent.type(searchBox(), 'tart');

    expect(router.state.location.pathname).toBe('/recipes');
    expect(router.state.location.search).toBe('?q=tart');
    expect(searchBox()).toHaveValue('tart');
    expect(searchBox()).toHaveFocus();
    expect(await screen.findByRole('heading', { level: 2, name: 'Apple tart' })).toBeInTheDocument();
  });

  it('goes back to the recipe, with the field empty, after a search typed there', async () => {
    answerTartSearch();
    const { router } = renderRoute('/recipes/apple-tart');
    await screen.findByRole('heading', { level: 1, name: 'Apple tart' });
    await userEvent.type(searchBox(), 'tart');

    await act(async () => {
      await router.navigate(-1);
    });

    expect(router.state.location.pathname).toBe('/recipes/apple-tart');
    expect(await screen.findByRole('heading', { level: 1, name: 'Apple tart' })).toBeInTheDocument();
    expect(searchBox()).toHaveValue('');
  });

  it('opens the field from the search button and closes it again while empty', async () => {
    renderRoute('/');
    expect(searchButton()).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(searchButton());

    expect(searchButton()).toHaveAttribute('aria-expanded', 'true');
    expect(searchBox()).toHaveFocus();

    await userEvent.click(searchButton());

    expect(searchButton()).toHaveAttribute('aria-expanded', 'false');
  });

  it('keeps the field open while a search is on', async () => {
    renderRoute('/recipes?q=tart');
    expect(searchButton()).toHaveAttribute('aria-expanded', 'true');

    await userEvent.click(searchButton());

    expect(searchButton()).toHaveAttribute('aria-expanded', 'true');
    expect(searchBox()).toHaveFocus();
  });

  it.each([
    ['pressing Clear search', () => userEvent.click(screen.getByRole('button', { name: 'Clear search' }))],
    [
      'deleting the last character',
      async () => {
        await userEvent.click(searchBox());
        await userEvent.keyboard('{Backspace>4/}');
      }
    ]
  ])('keeps the field open and focused after %s on a search from the address', async (_, clear) => {
    renderRoute('/recipes?q=tart');

    await clear();

    expect(searchBox()).toHaveValue('');
    expect(searchButton()).toHaveAttribute('aria-expanded', 'true');
    expect(searchBox()).toHaveFocus();
  });

  it('links Sign in back to the page and its search when signed out', async () => {
    renderRoute('/recipes?q=soup');

    const banner = screen.getByRole('banner');
    expect(await within(banner).findByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/sign-in?next=%2Frecipes%3Fq%3Dsoup'
    );
  });

  it('signs out from the account menu and then offers Sign in', async () => {
    const signOuts = answerSignedIn();
    renderRoute('/recipes');

    await userEvent.click(await screen.findByRole('button', { name: 'Account for Sam' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Sign out' }));

    const banner = screen.getByRole('banner');
    expect(await within(banner).findByRole('link', { name: 'Sign in' })).toBeInTheDocument();
    expect(within(banner).queryByRole('button', { name: 'Account for Sam' })).not.toBeInTheDocument();
    expect(signOuts).toEqual([SESSION]);
  });

  it('names the account menu after the account', async () => {
    answerSignedIn();
    renderRoute('/recipes');

    await userEvent.click(await screen.findByRole('button', { name: 'Account for Sam' }));

    const menu = await screen.findByRole('menu');
    expect(menu).toHaveTextContent(/^SamAccountHouseholdSign out$/);
  });

  it('opens the account page from the account menu', async () => {
    answerSignedIn();
    const { router } = renderRoute('/recipes');

    await userEvent.click(await screen.findByRole('button', { name: 'Account for Sam' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Account' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Your account' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/account');
  });

  it('opens the household page from the account menu', async () => {
    answerSignedIn();
    server.use(
      http.get('/api/household/', () =>
        HttpResponse.json<components['schemas']['Household']>({
          id: 1,
          name: "Sam's household",
          members: [{ id: 1, name: 'Sam', is_you: true }]
        })
      )
    );
    const { router } = renderRoute('/recipes');

    await userEvent.click(await screen.findByRole('button', { name: 'Account for Sam' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Household' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Your household' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/household');
  });

  it.each([
    ['the server fails', () => new HttpResponse(null, { status: 500 })],
    ['the network fails', () => HttpResponse.error()]
  ])('says signing out failed and stays signed in when %s', async (_, answer) => {
    answerSignedIn();
    server.use(http.delete(SESSION, answer));
    renderRoute('/recipes');

    await userEvent.click(await screen.findByRole('button', { name: 'Account for Sam' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Sign out' }));

    expect(await screen.findByText("Couldn't sign out. Check your connection and try again.")).toBeInTheDocument();
    const banner = screen.getByRole('banner');
    expect(within(banner).getByRole('button', { name: 'Account for Sam' })).toBeInTheDocument();
    expect(within(banner).queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument();
  });

  it('shows neither Sign in nor Account until the session is known', async () => {
    const answer: { send?: () => void } = {};
    server.use(
      http.get(
        ACCOUNT,
        () =>
          new Promise<Response>((resolve) => {
            answer.send = () => resolve(currentAccount());
          })
      )
    );
    renderRoute('/recipes');
    const banner = screen.getByRole('banner');
    await waitFor(() => expect(answer.send).toBeDefined());

    expect(within(banner).getByRole('link', { name: 'Tastebook' })).toBeInTheDocument();
    expect(within(banner).queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument();
    expect(within(banner).queryByRole('button', { name: 'Account' })).not.toBeInTheDocument();

    answer.send?.();

    expect(await within(banner).findByRole('link', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('shows neither Sign in nor Account on the sign-in page', async () => {
    const { router } = renderRoute('/');
    const banner = screen.getByRole('banner');
    expect(await within(banner).findByRole('link', { name: 'Sign in' })).toBeInTheDocument();

    await act(async () => {
      await router.navigate('/sign-in');
    });

    expect(screen.getByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
    expect(within(banner).getByRole('link', { name: 'Tastebook' })).toBeInTheDocument();
    expect(within(banner).queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument();
    expect(within(banner).queryByRole('button', { name: 'Account' })).not.toBeInTheDocument();
  });
});
