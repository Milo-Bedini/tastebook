import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';

import type { components } from '../api/schema';
import { renderRoute } from '../test/render-route';
import { server } from '../test/server';

type CurrentAccount = components['schemas']['CurrentAccount'];
type ListSummary = components['schemas']['ListSummary'];
type Lists = components['schemas']['Lists'];
type NewList = components['schemas']['NewList'];
type SavedList = components['schemas']['SavedList'];

const signedIn = (isSignedIn: () => boolean = () => true) =>
  server.use(
    http.get('/api/account/', () =>
      HttpResponse.json<CurrentAccount>({
        account: isSignedIn() ? { email: 'milo@example.com', name: 'Milo', unit_system: 'metric' } : null
      })
    )
  );

const favourites: ListSummary = {
  slug: 'favourites',
  name: 'Favourites',
  scope: 'personal',
  recipe_count: 0,
  covers: []
};

const summary = (scope: ListSummary['scope'], name: string, recipeCount = 0): ListSummary => ({
  slug: name.toLowerCase().replaceAll(' ', '-'),
  name,
  scope,
  recipe_count: recipeCount,
  covers: recipeCount === 0 ? [] : [{ id: 3, photo: null }]
});

const answerLists = (lists: ListSummary[], householdMembers = 2) =>
  server.use(
    http.get('/api/lists/', () =>
      HttpResponse.json<Lists>({ household_name: 'The Bedinis', household_members: householdMembers, lists })
    )
  );

// Each group's heading, and the text of each row under it.
const groups = () =>
  within(screen.getByRole('main'))
    .getAllByRole('region')
    .map((group) => [
      within(group).getByRole('heading', { level: 2 }).textContent,
      ...within(group)
        .queryAllByRole('link')
        .map((row) => row.textContent)
    ]);

describe('signed out', () => {
  it('goes to sign in and back', async () => {
    const { router } = renderRoute('/lists');

    await waitFor(() =>
      expect(router.state.location.pathname + router.state.location.search).toBe('/sign-in?next=%2Flists')
    );
  });
});

describe('the Lists page', () => {
  it('shows your lists, Favourites first, then the household’s under its name', async () => {
    signedIn();
    answerLists([
      { ...favourites, recipe_count: 4, covers: [{ id: 3, photo: null }] },
      summary('personal', 'Weeknight dinners', 1),
      summary('household', 'Christmas'),
      summary('household', 'Sunday roasts', 12)
    ]);
    renderRoute('/lists');

    await screen.findByRole('region', { name: 'Just you' });

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Your lists');
    expect(groups()).toEqual([
      ['Just you', 'Favourites4 recipes', 'Weeknight dinners1 recipe'],
      ['The Bedinis', 'ChristmasNothing here yet', 'Sunday roasts12 recipes']
    ]);
    expect(screen.getByRole('link', { name: /Weeknight dinners/ })).toHaveAttribute('href', '/lists/weeknight-dinners');
    expect(screen.getByRole('link', { name: /Christmas/ })).toHaveAttribute('href', '/lists/household/christmas');
  });

  it('shows Favourites before anything is saved, and where the household’s lists will go', async () => {
    signedIn();
    renderRoute('/lists');

    const row = await screen.findByRole('link', { name: /Favourites/ });

    expect(row).toHaveTextContent('FavouritesNothing saved yet');
    expect(row).toHaveAttribute('href', '/lists/favourites');
    expect(
      within(screen.getByRole('region', { name: "Milo's household" })).getByText(
        "Lists you make for Milo's household show here, for everyone in it."
      )
    ).toBeInTheDocument();
  });

  it('says when the lists could not load, and tries again', async () => {
    signedIn();
    const state = { fails: true };
    server.use(
      http.get('/api/lists/', () =>
        state.fails
          ? new HttpResponse(null, { status: 500 })
          : HttpResponse.json<Lists>({ household_name: 'The Bedinis', household_members: 2, lists: [favourites] })
      )
    );
    renderRoute('/lists');

    expect(await screen.findByText("Couldn't load your lists")).toBeInTheDocument();
    expect(screen.queryByText('Finding your lists…')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New list' })).not.toBeInTheDocument();
    state.fails = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('link', { name: /Favourites/ })).toBeInTheDocument();
  });
});

const weeknightDinners: SavedList = {
  slug: 'weeknight-dinners',
  name: 'Weeknight dinners',
  scope: 'personal',
  household_name: null,
  saved_recipes: []
};

// Answers each new list with `answer`, recording each body sent.
const answerMaking = (answer: (body: NewList) => Response) => {
  const sent: NewList[] = [];
  server.use(
    http.post('/api/lists/', async ({ request }) => {
      const body = (await request.json()) as NewList;
      sent.push(body);
      return answer(body);
    })
  );
  return sent;
};

const made = ({ name, scope }: NewList) =>
  HttpResponse.json<SavedList>(
    {
      slug: name.toLowerCase().replaceAll(' ', '-'),
      name,
      scope,
      household_name: scope === 'household' ? 'The Bedinis' : null,
      saved_recipes: []
    },
    { status: 201 }
  );

const openNewList = async () => {
  await userEvent.click(await screen.findByRole('button', { name: 'New list' }));
  return screen.getByRole('dialog', { name: 'New list' });
};

const makeList = async (name: string) => {
  await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), name);
  await userEvent.click(screen.getByRole('button', { name: 'Make list' }));
};

describe('making a list', () => {
  it('starts on a list just for you, with focus in its name', async () => {
    signedIn();
    answerLists([favourites]);
    renderRoute('/lists');

    const sheet = await openNewList();

    expect(within(sheet).getByRole('textbox', { name: 'Name' })).toHaveFocus();
    expect(within(sheet).getByRole('textbox', { name: 'Name' })).toHaveAccessibleDescription('Like Weeknight dinners.');
    const whoFor = within(sheet).getByRole('group', { name: "Who's it for?" });
    expect(within(whoFor).getByRole('radio', { name: 'Just you' })).toBeChecked();
    expect(whoFor).toHaveAccessibleDescription('Only you see it.');
  });

  it.each<[number, string]>([
    [2, 'Everyone in The Bedinis sees it and can change it.'],
    [1, 'Everyone who joins The Bedinis will see it and can change it.']
  ])('says who sees a household list in a household of %i', async (members, said) => {
    signedIn();
    answerLists([favourites], members);
    renderRoute('/lists');

    const whoFor = within(await openNewList()).getByRole('group', { name: "Who's it for?" });
    await userEvent.click(within(whoFor).getByRole('radio', { name: 'Household' }));

    expect(whoFor).toHaveAccessibleDescription(said);
  });

  it.each<[string, NewList['scope'], string]>([
    ['Just you', 'personal', '/lists/weeknight-dinners'],
    ['Household', 'household', '/lists/household/weeknight-dinners']
  ])('makes a list for %s and opens it, with focus on its heading', async (choice, scope, path) => {
    signedIn();
    answerLists([favourites]);
    const sent = answerMaking(made);
    server.use(
      http.get(`/api${path}/`, () => HttpResponse.json<SavedList>({ ...weeknightDinners, scope }, { status: 500 }))
    );
    const { router } = renderRoute('/lists');
    await openNewList();
    await userEvent.click(screen.getByRole('radio', { name: choice }));

    await makeList(' Weeknight dinners ');

    await waitFor(() => expect(router.state.location.pathname).toBe(path));
    expect(sent).toEqual([{ name: 'Weeknight dinners', scope }]);
    // Shown from the answer, though asking again fails.
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Weeknight dinners'));
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus();
    expect(await screen.findByText('Made Weeknight dinners')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('refuses a blank name without asking Tastebook', async () => {
    signedIn();
    answerLists([favourites]);
    const sent = answerMaking(made);
    renderRoute('/lists');
    await openNewList();

    await makeList('   ');

    const name = screen.getByRole('textbox', { name: 'Name' });
    expect(name).toHaveAccessibleDescription('Give the list a name, like Weeknight dinners.');
    expect(name).toHaveFocus();
    expect(sent).toEqual([]);
  });

  it('says why Tastebook refused the name, keeping who it’s for', async () => {
    signedIn();
    answerLists([favourites]);
    const refusal = 'The Bedinis already have a list called Christmas. Try another name, like Christmas 2026.';
    answerMaking(() => HttpResponse.json({ name: [refusal] }, { status: 400 }));
    renderRoute('/lists');
    await openNewList();
    await userEvent.click(screen.getByRole('radio', { name: 'Household' }));

    await makeList('Christmas');

    const name = screen.getByRole('textbox', { name: 'Name' });
    await waitFor(() => expect(name).toHaveAccessibleDescription(refusal));
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(name).toHaveFocus();
    expect(screen.getByRole('radio', { name: 'Household' })).toBeChecked();
  });

  it('shows that it is making the list', async () => {
    signedIn();
    answerLists([favourites]);
    const gate = { release: () => {} };
    const released = new Promise<void>((resolve) => {
      gate.release = resolve;
    });
    server.use(
      http.post('/api/lists/', async ({ request }) => {
        await released;
        return made((await request.json()) as NewList);
      })
    );
    renderRoute('/lists');
    await openNewList();

    await makeList('Weeknight dinners');

    expect(await screen.findByRole('button', { name: 'Making…' })).toBeInTheDocument();
    gate.release();
    expect(await screen.findByText('Made Weeknight dinners')).toBeInTheDocument();
  });

  it.each<[string, () => Response]>([
    ['refused while still signed in', () => new HttpResponse(null, { status: 403 })],
    ['not answered', () => HttpResponse.error()]
  ])('keeps the sheet and offers to try again when making it is %s', async (_, answer) => {
    signedIn();
    answerLists([favourites]);
    const sent = answerMaking(answer);
    renderRoute('/lists');
    await openNewList();

    await makeList('Weeknight dinners');

    const said = await screen.findByText("Couldn't make the list. Check your connection, then try again.");
    expect(said).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'New list' })).toBeInTheDocument();
    const tryAgain = await screen.findByRole('button', { name: 'Try again' });
    tryAgain.focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(sent).toHaveLength(2));
  });

  it('sends you to sign in when Tastebook says you are signed out', async () => {
    const state = { signedOut: false };
    signedIn(() => !state.signedOut);
    answerLists([favourites]);
    answerMaking(() => {
      state.signedOut = true;
      return new HttpResponse(null, { status: 403 });
    });
    const { router } = renderRoute('/lists');
    await openNewList();

    await makeList('Weeknight dinners');

    await waitFor(() =>
      expect(router.state.location.pathname + router.state.location.search).toBe('/sign-in?next=%2Flists')
    );
  });
});
