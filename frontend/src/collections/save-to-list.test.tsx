import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';

import type { components } from '../api/schema';
import { renderRoute } from '../test/render-route';
import { server } from '../test/server';

type CurrentAccount = components['schemas']['CurrentAccount'];
type ListPlace = components['schemas']['ListPlace'];
type RecipeLists = components['schemas']['RecipeLists'];
type SavedList = components['schemas']['SavedList'];
type SavedRecipe = components['schemas']['SavedRecipe'];

const signedIn = (isSignedIn: () => boolean = () => true) =>
  server.use(
    http.get('/api/account/', () =>
      HttpResponse.json<CurrentAccount>({
        account: isSignedIn() ? { email: 'milo@example.com', name: 'Milo', unit_system: 'metric' } : null
      })
    )
  );

const place = (scope: ListPlace['scope'], name: string, recipeCount: number, savedId: number | null): ListPlace => ({
  slug: name.toLowerCase().replaceAll(' ', '-'),
  name,
  scope,
  recipe_count: recipeCount,
  saved_id: savedId
});

const milosLists = () => [
  place('personal', 'Favourites', 4, null),
  place('personal', 'Weeknight dinners', 7, null),
  place('household', 'Christmas', 0, null),
  place('household', 'Sunday roasts', 12, 31)
];

const savedRecipe = (id: number): SavedRecipe => ({
  id,
  title: 'Apple tart',
  saved_at: '2026-11-08T12:00:00Z',
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
    diet_tags: []
  }
});

type Answer = () => Response | undefined | Promise<Response | undefined>;

// The backend's lists for Apple tart, which saves and unsaves change, so the page's asking again sees them. A save or
// unsave answered by `answer` changes nothing; one it leaves to the fake (undefined) does.
const answerLists = (
  lists: ListPlace[],
  {
    householdName = 'The Bedinis',
    answerSave = () => undefined,
    answerUnsave = () => undefined
  }: { householdName?: string | null; answerSave?: Answer; answerUnsave?: Answer } = {}
) => {
  const state = { lists, nextId: 40 };
  const sent: string[] = [];
  server.use(
    http.get('/api/lists/recipes/apple-tart/', () =>
      HttpResponse.json<RecipeLists>({ household_name: householdName, lists: state.lists })
    ),
    // The heart reads Favourites.
    http.get('/api/lists/favourites/', () => {
      const favourites = state.lists.find(({ scope, slug }) => scope === 'personal' && slug === 'favourites');
      return HttpResponse.json<SavedList>({
        slug: 'favourites',
        name: 'Favourites',
        scope: 'personal',
        household_name: null,
        saved_recipes: favourites?.saved_id ? [savedRecipe(favourites.saved_id)] : []
      });
    }),
    http.post('/api/lists/recipes/apple-tart/', async ({ request }) => {
      const { scope, list } = (await request.json()) as { scope: string; list: string };
      sent.push(`POST ${scope} ${list}`);
      const answered = await answerSave();
      if (answered !== undefined) {
        return answered;
      }
      const id = state.nextId++;
      state.lists = state.lists.map((found) =>
        found.scope === scope && found.slug === list
          ? { ...found, saved_id: id, recipe_count: found.recipe_count + 1 }
          : found
      );
      return HttpResponse.json<SavedRecipe>(savedRecipe(id), { status: 201 });
    }),
    http.delete('/api/lists/saved/:id/', async ({ params }) => {
      sent.push(`DELETE ${params.id}`);
      const answered = await answerUnsave();
      // Anything but a 404 changes nothing; a 404 says it was taken out already.
      if (answered !== undefined && answered.status !== 404) {
        return answered;
      }
      state.lists = state.lists.map((found) =>
        found.saved_id === Number(params.id)
          ? { ...found, saved_id: null, recipe_count: found.recipe_count - 1 }
          : found
      );
      return answered ?? HttpResponse.json({ undo: 'a-token' });
    })
  );
  return sent;
};

const held = () => {
  const gate = { release: () => {} };
  const released = new Promise<void>((resolve) => {
    gate.release = resolve;
  });
  return { gate, wait: async () => released.then(() => undefined) };
};

const saveToList = () => screen.getByRole('button', { name: 'Save to list' });

const openRecipe = async (path = '/recipes/apple-tart') => {
  const rendered = renderRoute(path);
  await screen.findByRole('heading', { level: 1, name: 'Apple tart' });
  return rendered;
};

const openSheet = async () => {
  const rendered = await openRecipe();
  await userEvent.click(saveToList());
  const sheet = await screen.findByRole('dialog', { name: 'Save to a list' });
  await within(sheet).findByRole('group', { name: 'Just you' });
  return { ...rendered, sheet };
};

const box = (name: string) => screen.getByRole('checkbox', { name });

const textOf = (ids: string | null) =>
  (ids ?? '')
    .split(' ')
    .map((id) => document.getElementById(id)?.textContent)
    .join(' ');

// Each group's lists as whether they're ticked, their names and their counts.
const groups = (sheet: HTMLElement) =>
  within(sheet)
    .getAllByRole('group')
    .map((group) => [
      group.querySelector('legend')?.textContent,
      within(group)
        .getAllByRole('checkbox')
        .map(
          (checkbox) =>
            `${checkbox.getAttribute('aria-checked') === 'true' ? '[x]' : '[ ]'} ${textOf(
              checkbox.getAttribute('aria-labelledby')
            )}, ${textOf(checkbox.getAttribute('aria-describedby'))}`
        )
    ]);

const savedInLine = () =>
  screen.queryByText((_, element) => element?.tagName === 'P' && /^Saved in /.test(element.textContent ?? ''));

describe('the "Saved in" line', () => {
  it.each<[string, ListPlace[], string | null, string[]]>([
    ['no list', [place('personal', 'Favourites', 0, null)], null, []],
    [
      'one list',
      [place('personal', 'Favourites', 1, 5), place('household', 'Christmas', 0, null)],
      'Saved in Favourites.',
      ['/lists/favourites']
    ],
    [
      'two lists',
      [place('personal', 'Weeknight dinners', 7, 6), place('household', 'Sunday roasts', 12, 7)],
      'Saved in Weeknight dinners and Sunday roasts.',
      ['/lists/weeknight-dinners', '/lists/household/sunday-roasts']
    ],
    [
      'three lists',
      [
        place('personal', 'Favourites', 1, 5),
        place('personal', 'Puddings', 2, 6),
        place('household', 'Christmas', 3, 7)
      ],
      'Saved in Favourites, Puddings and Christmas.',
      ['/lists/favourites', '/lists/puddings', '/lists/household/christmas']
    ],
    [
      'four lists',
      [1, 2, 3, 4].map((n) => place('personal', `List ${n}`, 1, n)),
      'Saved in List 1, List 2, List 3 and 1 more list.',
      ['/lists/list-1', '/lists/list-2', '/lists/list-3']
    ],
    [
      'five lists',
      [1, 2, 3, 4, 5].map((n) => place('personal', `List ${n}`, 1, n)),
      'Saved in List 1, List 2, List 3 and 2 more lists.',
      ['/lists/list-1', '/lists/list-2', '/lists/list-3']
    ]
  ])('names the lists that hold it when it is in %s', async (_, lists, line, hrefs) => {
    signedIn();
    answerLists(lists);
    const { queryClient } = await openRecipe();
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));

    expect(savedInLine()?.textContent ?? null).toBe(line);
    expect(
      within(savedInLine() ?? document.createElement('p'))
        .queryAllByRole('link')
        .map((link) => link.getAttribute('href'))
    ).toEqual(hrefs);
  });

  it('is left out signed out, though Save to list is there', async () => {
    answerLists(milosLists());
    const { queryClient } = await openRecipe();
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));

    expect(saveToList()).toBeInTheDocument();
    expect(savedInLine()).not.toBeInTheDocument();
  });
});

describe('the Save to list sheet', () => {
  it('lists your lists and the household’s, ticking those that hold the recipe, with focus on the first', async () => {
    signedIn();
    answerLists(milosLists());
    const { sheet } = await openSheet();

    expect(within(sheet).getByText('Apple tart')).toBeInTheDocument();
    expect(groups(sheet)).toEqual([
      ['Just you', ['[ ] Favourites, 4 recipes', '[ ] Weeknight dinners, 7 recipes']],
      ['The Bedinis', ['[ ] Christmas, Nothing here yet', '[x] Sunday roasts, 12 recipes']]
    ]);
    expect(box('Favourites')).toHaveFocus();
    expect(within(sheet).getByRole('link', { name: 'Lists' })).toHaveAttribute('href', '/lists');
  });

  it('says what goes where when there are no lists but Favourites', async () => {
    signedIn();
    answerLists([place('personal', 'Favourites', 0, null)]);
    const { sheet } = await openSheet();

    expect(groups(sheet)).toEqual([['Just you', ['[ ] Favourites, Nothing saved yet']]]);
    expect(within(sheet).getByRole('heading', { name: 'The Bedinis' })).toBeInTheDocument();
    expect(
      within(sheet).getByText('Lists you make for The Bedinis show here, for everyone in it.')
    ).toBeInTheDocument();
  });

  it('leaves the household out for an account with none', async () => {
    signedIn();
    answerLists([place('personal', 'Favourites', 0, null)], { householdName: null });
    const { sheet } = await openSheet();

    expect(groups(sheet)).toEqual([['Just you', ['[ ] Favourites, Nothing saved yet']]]);
    expect(within(sheet).queryByRole('heading', { name: 'The Bedinis' })).not.toBeInTheDocument();
  });

  it('saves at once on a tick, busy until the answer, and the line follows', async () => {
    signedIn();
    const { gate, wait } = held();
    const sent = answerLists(milosLists(), { answerSave: wait });
    await openSheet();

    await userEvent.click(box('Weeknight dinners'));
    await userEvent.click(box('Weeknight dinners'));

    expect(box('Weeknight dinners')).toHaveAttribute('aria-checked', 'true');
    expect(box('Weeknight dinners')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('8 recipes')).toBeInTheDocument();
    gate.release();
    await waitFor(() => expect(box('Weeknight dinners')).not.toHaveAttribute('aria-busy'));
    expect(box('Weeknight dinners')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('Saved to Weeknight dinners')).toHaveAttribute('role', 'status');
    expect(sent).toEqual(['POST personal weeknight-dinners']);
    await waitFor(() => expect(savedInLine()).toHaveTextContent('Saved in Weeknight dinners and Sunday roasts.'));
  });

  it('removes at once on an untick, with no Undo but ticking again', async () => {
    signedIn();
    const sent = answerLists(milosLists());
    await openSheet();

    await userEvent.click(box('Sunday roasts'));

    await waitFor(() => expect(screen.getByText('Removed from Sunday roasts')).toBeInTheDocument());
    expect(box('Sunday roasts')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('11 recipes')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
    await waitFor(() => expect(savedInLine()).not.toBeInTheDocument());

    await userEvent.click(box('Sunday roasts'));

    await waitFor(() => expect(box('Sunday roasts')).toHaveAttribute('aria-checked', 'true'));
    expect(sent).toEqual(['DELETE 31', 'POST household sunday-roasts']);
  });

  it('fills the heart when Favourites is ticked', async () => {
    signedIn();
    answerLists(milosLists());
    await openSheet();
    const heart = screen.getByRole('button', { name: 'Favourite', hidden: true });
    expect(heart).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(box('Favourites'));

    await waitFor(() => expect(heart).toHaveAttribute('aria-pressed', 'true'));
  });

  it.each<[string, () => Response]>([
    ['refused while still signed in', () => new HttpResponse(null, { status: 403 })],
    ['refused for a missing list', () => new HttpResponse(null, { status: 400 })],
    ['answered with a server error', () => new HttpResponse(null, { status: 500 })],
    ['not answered', () => HttpResponse.error()]
  ])('turns a tick back and says why under the row when the save is %s', async (_, answer) => {
    signedIn();
    const sent = answerLists(milosLists(), { answerSave: answer });
    await openSheet();

    await userEvent.click(box('Weeknight dinners'));

    const why = "Couldn't save it to Weeknight dinners. Check your connection, then tick it again.";
    await waitFor(() => expect(box('Weeknight dinners')).toHaveAccessibleDescription(`7 recipes ${why}`));
    expect(box('Weeknight dinners')).toHaveAttribute('aria-checked', 'false');
    expect(sent).toEqual(['POST personal weeknight-dinners']);

    // The next tick is the retry, and takes the line away.
    await userEvent.click(box('Christmas'));
    await waitFor(() => expect(box('Weeknight dinners')).toHaveAccessibleDescription('7 recipes'));
  });

  it('says so under the row when the list or the recipe has gone', async () => {
    signedIn();
    answerLists(milosLists(), { answerSave: () => new HttpResponse(null, { status: 404 }) });
    await openSheet();

    await userEvent.click(box('Weeknight dinners'));

    await waitFor(() =>
      expect(box('Weeknight dinners')).toHaveAccessibleDescription(
        "7 recipes Couldn't save it to Weeknight dinners: the list or this recipe has gone."
      )
    );
    expect(box('Weeknight dinners')).toHaveAttribute('aria-checked', 'false');
  });

  it.each<[string, () => Response]>([
    ['refused while still signed in', () => new HttpResponse(null, { status: 403 })],
    ['answered with a server error', () => new HttpResponse(null, { status: 500 })],
    ['not answered', () => HttpResponse.error()]
  ])('turns an untick back when the removal is %s', async (_, answer) => {
    signedIn();
    answerLists(milosLists(), { answerUnsave: answer });
    await openSheet();

    await userEvent.click(box('Sunday roasts'));

    await waitFor(() =>
      expect(box('Sunday roasts')).toHaveAccessibleDescription(
        "12 recipes Couldn't remove it from Sunday roasts. Check your connection, then untick it again."
      )
    );
    expect(box('Sunday roasts')).toHaveAttribute('aria-checked', 'true');
  });

  it('counts a removal already made elsewhere as removed', async () => {
    signedIn();
    answerLists(milosLists(), { answerUnsave: () => new HttpResponse(null, { status: 404 }) });
    await openSheet();

    await userEvent.click(box('Sunday roasts'));

    await waitFor(() => expect(screen.getByText('Removed from Sunday roasts')).toBeInTheDocument());
    expect(box('Sunday roasts')).toHaveAttribute('aria-checked', 'false');
  });

  it('sends you to sign in, to come back to the sheet, when Tastebook says you are signed out', async () => {
    const state = { signedOut: false };
    signedIn(() => !state.signedOut);
    answerLists(milosLists(), {
      answerSave: () => {
        state.signedOut = true;
        return new HttpResponse(null, { status: 403 });
      }
    });
    const { router } = await openSheet();

    await userEvent.click(box('Weeknight dinners'));

    await waitFor(() =>
      expect(router.state.location.pathname + router.state.location.search).toBe(
        '/sign-in?next=%2Frecipes%2Fapple-tart%3Fsave-to-list%3Dopen'
      )
    );
  });

  it('says it is finding your lists until they come', async () => {
    signedIn();
    const { gate, wait } = held();
    server.use(
      http.get('/api/lists/recipes/apple-tart/', async () => {
        await wait();
        return HttpResponse.json<RecipeLists>({ household_name: null, lists: milosLists() });
      })
    );
    await openRecipe();

    await userEvent.click(saveToList());

    const sheet = await screen.findByRole('dialog', { name: 'Save to a list' });
    expect(within(sheet).getByRole('status')).toHaveTextContent('Finding your lists…');
    gate.release();
    expect(await within(sheet).findByRole('checkbox', { name: 'Favourites' })).toBeInTheDocument();
  });

  it('offers to try again when the lists can’t be loaded', async () => {
    signedIn();
    const state = { fail: true };
    server.use(
      http.get('/api/lists/recipes/apple-tart/', () =>
        state.fail
          ? new HttpResponse(null, { status: 500 })
          : HttpResponse.json<RecipeLists>({ household_name: null, lists: milosLists() })
      )
    );
    const { queryClient } = await openRecipe();
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));
    expect(savedInLine()).not.toBeInTheDocument();

    await userEvent.click(saveToList());

    const sheet = await screen.findByRole('dialog', { name: 'Save to a list' });
    expect(within(sheet).getByRole('alert')).toHaveTextContent("Couldn't load your lists");
    state.fail = false;
    await userEvent.click(within(sheet).getByRole('button', { name: 'Try again' }));
    expect(await within(sheet).findByRole('checkbox', { name: 'Favourites' })).toBeInTheDocument();
  });

  it('gives focus back to Save to list when it closes', async () => {
    signedIn();
    answerLists(milosLists());
    await openSheet();

    await userEvent.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(saveToList()).toHaveFocus();
  });
});

describe('Save to list signed out', () => {
  it('sends a press through sign in, to come back with the sheet open', async () => {
    const { router } = await openRecipe();

    await userEvent.click(saveToList());

    expect(router.state.location.pathname + router.state.location.search).toBe(
      '/sign-in?next=%2Frecipes%2Fapple-tart%3Fsave-to-list%3Dopen'
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens the sheet on the way back, and closing it drops that from the address', async () => {
    signedIn();
    answerLists(milosLists());
    const { router } = renderRoute('/recipes/apple-tart?save-to-list=open');

    const sheet = await screen.findByRole('dialog', { name: 'Save to a list' });
    expect(await within(sheet).findByRole('checkbox', { name: 'Favourites' })).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole('button', { name: 'Close' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(router.state.location.search).toBe('');
    expect(saveToList()).toHaveFocus();
  });
});
