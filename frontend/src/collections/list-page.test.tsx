import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';

import type { components } from '../api/schema';
import { renderRoute } from '../test/render-route';
import { server } from '../test/server';

type CurrentAccount = components['schemas']['CurrentAccount'];
type ListedRecipe = components['schemas']['ListedRecipe'];
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
  hidden_for_review: false,
  waiting_for_review: false,
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

const favourites = (savedRecipes: SavedRecipe[]): SavedList => ({
  slug: 'favourites',
  name: 'Favourites',
  scope: 'personal',
  household_name: null,
  saved_recipes: savedRecipes
});

const answerFavourites = (savedRecipes: SavedRecipe[]) => {
  const shown = { savedRecipes };
  server.use(http.get('/api/lists/favourites/', () => HttpResponse.json<SavedList>(favourites(shown.savedRecipes))));
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
  it.each(['/lists/favourites', '/lists/weeknight-dinners', '/lists/household/sunday-roasts'])(
    '%s goes to sign in and back',
    async (path) => {
      const { router } = renderRoute(path);

      await waitFor(() =>
        expect(router.state.location.pathname + router.state.location.search).toBe(
          `/sign-in?next=${encodeURIComponent(path)}`
        )
      );
    }
  );
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
    expect(screen.getByText('Just you')).toBeInTheDocument();
    // Favourites is never renamed or deleted.
    expect(screen.queryByRole('button', { name: 'Rename' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete list' })).not.toBeInTheDocument();
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
          is_copy: false,
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
          original_source: '',
          original_source_url: '',
          ingredient_lines: [],
          ingredient_groups: [],
          steps: [],
          diet_tag_conflicts: [],
          can_delete: false,
          can_edit: false,
          can_publish: false,
          will_wait_for_review: false,
          save_count: null,
          can_share: false,
          share_token: null,
          hidden_for_review: false,
          waiting_for_review: false,
          can_report: false,
          reported: false
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
    http.delete('/api/lists/saved/:id/', ({ params }) => {
      sent.push(`DELETE ${params.id}`);
      return answer();
    }),
    http.post('/api/lists/saved/restore/', async ({ request }) => {
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

  it('moves focus to the new bottom heart when the bottom card goes', async () => {
    signedIn();
    answerFavourites([bibimbap, shakshuka, curry]);
    answerUnsaving(unsaved);
    renderRoute('/lists/favourites');

    await userEvent.click(await screen.findByRole('button', { name: 'Favourite Grandma’s curry' }));

    expect(captions()).toEqual(['Bibimbap', 'Shakshuka']);
    expect(screen.getByRole('button', { name: 'Favourite Shakshuka' })).toHaveFocus();
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

type Lists = components['schemas']['Lists'];

const weeknightDinners: SavedList = {
  slug: 'weeknight-dinners',
  name: 'Weeknight dinners',
  scope: 'personal',
  household_name: null,
  saved_recipes: [bibimbap, shakshuka, curry]
};

const sundayRoasts: SavedList = {
  slug: 'sunday-roasts',
  name: 'Sunday roasts',
  scope: 'household',
  household_name: 'The Bedinis',
  saved_recipes: [bibimbap, shakshuka]
};

const pathOf = (list: SavedList) =>
  list.scope === 'household' ? `/lists/household/${list.slug}` : `/lists/${list.slug}`;

const apiPathOf = (list: SavedList) => `/api${pathOf(list)}/`;

// Answers the list's page with whatever `shown.list` holds, and Lists with The Bedinis' name.
const answerList = (list: SavedList) => {
  const shown: { list: SavedList | null } = { list };
  server.use(
    http.get(apiPathOf(list), () =>
      shown.list === null ? new HttpResponse(null, { status: 404 }) : HttpResponse.json<SavedList>(shown.list)
    ),
    http.get('/api/lists/', () =>
      HttpResponse.json<Lists>({ household_name: 'The Bedinis', household_members: 2, lists: [] })
    )
  );
  return shown;
};

describe('a list of your own or the household’s', () => {
  it.each<[SavedList, string]>([
    [weeknightDinners, 'Just you'],
    [sundayRoasts, 'The Bedinis']
  ])('shows %s.name with who sees it, its count, and Remove on every card', async (list, whoSees) => {
    signedIn();
    answerList(list);
    renderRoute(pathOf(list));

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(list.name);
    expect(screen.getByText(whoSees)).toBeInTheDocument();
    expect(screen.getByText(`${list.saved_recipes.length} recipes`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rename' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete list' })).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: /^Remove / }).map((button) => button.getAttribute('aria-label'))
    ).toEqual(list.saved_recipes.map((saved) => `Remove ${saved.title} from ${list.name}`));
    expect(screen.queryByRole('button', { name: /^Favourite / })).not.toBeInTheDocument();
  });

  it.each<[SavedList, string]>([
    [weeknightDinners, 'Recipes you add to it show here.'],
    [sundayRoasts, 'Recipes anyone in The Bedinis adds to it show here.']
  ])('says who fills %s.name while it is empty', async (list, said) => {
    signedIn();
    answerList({ ...list, saved_recipes: [] });
    renderRoute(pathOf(list));

    expect(await screen.findByRole('heading', { level: 2, name: `Nothing in ${list.name} yet` })).toBeInTheDocument();
    expect(screen.getByText(said)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Browse recipes' })).toHaveAttribute('href', '/recipes');
  });

  it('opens a recipe with its way back to the list', async () => {
    signedIn();
    answerList(sundayRoasts);
    const { router } = renderRoute(pathOf(sundayRoasts));

    await userEvent.click(await screen.findByRole('link', { name: 'Bibimbap' }));
    const back = await screen.findByRole('link', { name: 'Sunday roasts' });

    expect(back).toHaveAttribute('href', '/lists/household/sunday-roasts');
    expect(router.state.location.pathname).toBe('/recipes/bibimbap');
  });

  it.each<[string, SavedList, string]>([
    ['your own', weeknightDinners, "It's been renamed or deleted."],
    ['the household’s', sundayRoasts, 'Someone in The Bedinis deleted it.']
  ])('says when %s list has gone', async (_, list, said) => {
    signedIn();
    const shown = answerList(list);
    shown.list = null;
    renderRoute(pathOf(list));

    expect(await screen.findByRole('heading', { level: 1, name: 'This list has gone' })).toHaveFocus();
    expect(await screen.findByText(said)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'All lists' }).map((link) => link.getAttribute('href'))).toEqual([
      '/lists',
      '/lists'
    ]);
  });

  it('says when the list could not load, and tries again', async () => {
    signedIn();
    const state = { fails: true };
    server.use(
      http.get(apiPathOf(weeknightDinners), () =>
        state.fails ? HttpResponse.error() : HttpResponse.json<SavedList>(weeknightDinners)
      )
    );
    renderRoute(pathOf(weeknightDinners));

    expect(await screen.findByText("Couldn't load this list")).toBeInTheDocument();
    state.fails = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Weeknight dinners');
  });
});

describe('removing from a list', () => {
  it('takes the card away at once, moves focus to the next Remove, and puts it back in its place on Undo', async () => {
    signedIn();
    const shown = answerList(sundayRoasts);
    const sent = answerUnsaving(unsaved, () => HttpResponse.json<SavedRecipe>(bibimbap, { status: 201 }));
    renderRoute(pathOf(sundayRoasts));
    await screen.findByText('2 recipes');

    await userEvent.click(screen.getByRole('button', { name: 'Remove Bibimbap from Sunday roasts' }));

    expect(captions()).toEqual(['Shakshuka']);
    expect(screen.getByText('1 recipe')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Shakshuka from Sunday roasts' })).toHaveFocus();
    expect(await screen.findByText('Removed from Sunday roasts')).toBeInTheDocument();

    shown.list = sundayRoasts;
    await pressToastButton('Undo');

    await waitFor(() => expect(captions()).toEqual(['Bibimbap', 'Shakshuka']));
    expect(sent).toEqual(['DELETE 14', 'RESTORE token-13']);
  });

  it('moves focus to the new bottom Remove when the bottom card goes', async () => {
    signedIn();
    answerList(sundayRoasts);
    answerUnsaving(unsaved);
    renderRoute(pathOf(sundayRoasts));

    await userEvent.click(await screen.findByRole('button', { name: 'Remove Shakshuka from Sunday roasts' }));

    expect(captions()).toEqual(['Bibimbap']);
    expect(screen.getByRole('button', { name: 'Remove Bibimbap from Sunday roasts' })).toHaveFocus();
  });

  it('moves focus to the heading when the last card goes', async () => {
    signedIn();
    answerList({ ...weeknightDinners, saved_recipes: [curry] });
    answerUnsaving(unsaved);
    renderRoute(pathOf(weeknightDinners));

    await userEvent.click(await screen.findByRole('button', { name: 'Remove Grandma’s curry from Weeknight dinners' }));

    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus();
    expect(screen.getByRole('heading', { level: 2, name: 'Nothing in Weeknight dinners yet' })).toBeInTheDocument();
  });
});

// Answers each rename of `list` with `answer`, recording each name sent.
const answerRenaming = (list: SavedList, answer: () => Response) => {
  const sent: string[] = [];
  server.use(
    http.patch(apiPathOf(list), async ({ request }) => {
      sent.push(((await request.json()) as { name: string }).name);
      return answer();
    })
  );
  return sent;
};

const renameTo = async (name: string) => {
  await userEvent.click(await screen.findByRole('button', { name: 'Rename' }));
  const field = screen.getByRole('textbox', { name: 'Name' });
  await userEvent.clear(field);
  await userEvent.type(field, name);
  await userEvent.click(screen.getByRole('button', { name: 'Save name' }));
};

describe('renaming a list', () => {
  it('opens with the name selected and says who sees the list', async () => {
    signedIn();
    answerList(sundayRoasts);
    renderRoute(pathOf(sundayRoasts));

    await userEvent.click(await screen.findByRole('button', { name: 'Rename' }));
    const field = screen.getByRole('textbox', { name: 'Name' });

    expect(screen.getByRole('dialog', { name: 'Rename list' })).toBeInTheDocument();
    expect(field).toHaveFocus();
    expect(field).toHaveValue('Sunday roasts');
    expect([(field as HTMLInputElement).selectionStart, (field as HTMLInputElement).selectionEnd]).toEqual([0, 13]);
    expect(field).toHaveAccessibleDescription('Everyone in The Bedinis sees this list.');
  });

  it('moves the page to the new address, says so and gives focus back to Rename', async () => {
    signedIn();
    answerList(weeknightDinners);
    const midweek: SavedList = { ...weeknightDinners, slug: 'midweek-dinners', name: 'Midweek dinners' };
    const sent = answerRenaming(weeknightDinners, () => HttpResponse.json<SavedList>(midweek));
    const { router } = renderRoute(pathOf(weeknightDinners));

    await renameTo('  Midweek dinners ');

    await waitFor(() => expect(router.state.location.pathname).toBe('/lists/midweek-dinners'));
    expect(sent).toEqual(['Midweek dinners']);
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Midweek dinners'));
    expect(await screen.findByText('Renamed to Midweek dinners')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Rename' })).toHaveFocus());
  });

  it('refuses a blank name without asking Tastebook', async () => {
    signedIn();
    answerList(weeknightDinners);
    const sent = answerRenaming(weeknightDinners, () => HttpResponse.json<SavedList>(weeknightDinners));
    renderRoute(pathOf(weeknightDinners));

    await renameTo(' ');

    const field = screen.getByRole('textbox', { name: 'Name' });
    expect(field).toHaveAccessibleDescription('Give the list a name, like Weeknight dinners.');
    expect(field).toHaveFocus();
    expect(sent).toEqual([]);
  });

  it.each([weeknightDinners, sundayRoasts])('says why Tastebook refused the name for $name', async (list) => {
    signedIn();
    answerList(list);
    const refusal = 'You already have a list called Christmas. Try another name, like Christmas 2026.';
    answerRenaming(list, () => HttpResponse.json({ name: [refusal] }, { status: 400 }));
    renderRoute(pathOf(list));

    await renameTo('Christmas');

    const field = await screen.findByRole('textbox', { name: 'Name' });
    await waitFor(() => expect(field).toHaveAccessibleDescription(refusal));
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveFocus();
  });

  it.each([weeknightDinners, sundayRoasts])(
    'closes and says the list has gone when $name was deleted meanwhile',
    async (list) => {
      signedIn();
      answerList(list);
      answerRenaming(list, () => new HttpResponse(null, { status: 404 }));
      renderRoute(pathOf(list));

      await renameTo('Christmas');

      expect(await screen.findByRole('heading', { level: 1, name: 'This list has gone' })).toBeInTheDocument();
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    }
  );

  it.each([weeknightDinners, sundayRoasts])(
    'keeps the sheet open and offers to try again when $name could not be renamed',
    async (list) => {
      signedIn();
      answerList(list);
      const sent = answerRenaming(list, () => new HttpResponse(null, { status: 403 }));
      renderRoute(pathOf(list));

      await renameTo('Christmas');

      expect(
        await screen.findByText("Couldn't rename the list. Check your connection, then try again.")
      ).toBeInTheDocument();
      expect(screen.getByRole('dialog', { name: 'Rename list' })).toBeInTheDocument();
      await pressToastButton('Try again');
      await waitFor(() => expect(sent).toEqual(['Christmas', 'Christmas']));
    }
  );

  it('sends you to sign in when Tastebook says you are signed out', async () => {
    const state = { signedOut: false };
    signedIn(() => !state.signedOut);
    answerList(weeknightDinners);
    answerRenaming(weeknightDinners, () => {
      state.signedOut = true;
      return new HttpResponse(null, { status: 403 });
    });
    const { router } = renderRoute(pathOf(weeknightDinners));

    await renameTo('Christmas');

    await waitFor(() =>
      expect(router.state.location.pathname + router.state.location.search).toBe(
        '/sign-in?next=%2Flists%2Fweeknight-dinners'
      )
    );
  });
});

const answerDeleting = (list: SavedList, answer: () => Response) => {
  const sent: string[] = [];
  server.use(
    http.delete(apiPathOf(list), () => {
      sent.push(`DELETE ${list.slug}`);
      return answer();
    })
  );
  return sent;
};

const deleteList = async () => {
  await userEvent.click(await screen.findByRole('button', { name: 'Delete list' }));
  const dialog = screen.getByRole('alertdialog');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Delete list' }));
};

describe('deleting a list', () => {
  it.each<[SavedList, string]>([
    [weeknightDinners, 'Its 3 recipes stay in Tastebook and in any other list.'],
    [sundayRoasts, 'It goes for everyone in The Bedinis. Its 2 recipes stay in Tastebook and in any other list.'],
    [{ ...weeknightDinners, saved_recipes: [curry] }, 'Its 1 recipe stays in Tastebook and in any other list.'],
    [{ ...weeknightDinners, saved_recipes: [] }, 'It has no recipes yet.']
  ])('asks first, saying who loses %s.name and that its recipes stay', async (list, said) => {
    signedIn();
    answerList(list);
    renderRoute(pathOf(list));

    await userEvent.click(await screen.findByRole('button', { name: 'Delete list' }));

    const dialog = screen.getByRole('alertdialog', { name: `Delete ${list.name}?` });
    expect(dialog).toHaveAccessibleDescription(said);
  });

  it('goes back to Lists with focus on its heading, and says so', async () => {
    signedIn();
    answerList(sundayRoasts);
    const gate = { release: () => {} };
    const released = new Promise<void>((resolve) => {
      gate.release = resolve;
    });
    const sent: string[] = [];
    server.use(
      http.delete(apiPathOf(sundayRoasts), async () => {
        sent.push('DELETE sunday-roasts');
        await released;
        return new HttpResponse(null, { status: 204 });
      })
    );
    const { router } = renderRoute(pathOf(sundayRoasts));

    await deleteList();

    expect(await screen.findByRole('button', { name: 'Deleting…' })).toBeInTheDocument();
    gate.release();
    await waitFor(() => expect(router.state.location.pathname).toBe('/lists'));
    expect(sent).toEqual(['DELETE sunday-roasts']);
    expect(await screen.findByText('Deleted Sunday roasts')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Your lists' })).toHaveFocus());
  });

  it.each([weeknightDinners, sundayRoasts])(
    'goes back to Lists when someone had already deleted $name',
    async (list) => {
      signedIn();
      answerList(list);
      answerDeleting(list, () => new HttpResponse(null, { status: 404 }));
      const { router } = renderRoute(pathOf(list));

      await deleteList();

      await waitFor(() => expect(router.state.location.pathname).toBe('/lists'));
      expect(await screen.findByText(`${list.name} had already been deleted`)).toBeInTheDocument();
    }
  );

  it.each<[SavedList, () => Response]>([
    [weeknightDinners, () => new HttpResponse(null, { status: 403 })],
    [sundayRoasts, () => new HttpResponse(null, { status: 403 })],
    [weeknightDinners, () => HttpResponse.error()]
  ])('stays and offers to try again when %s.name could not be deleted', async (list, answer) => {
    signedIn();
    answerList(list);
    const sent = answerDeleting(list, answer);
    const { router } = renderRoute(pathOf(list));

    await deleteList();

    expect(
      await screen.findByText("Couldn't delete the list. Check your connection, then try again.")
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(pathOf(list));
    await pressToastButton('Try again');
    await waitFor(() => expect(sent).toHaveLength(2));
  });

  it('sends you to sign in when Tastebook says you are signed out', async () => {
    const state = { signedOut: false };
    signedIn(() => !state.signedOut);
    answerList(sundayRoasts);
    answerDeleting(sundayRoasts, () => {
      state.signedOut = true;
      return new HttpResponse(null, { status: 403 });
    });
    const { router } = renderRoute(pathOf(sundayRoasts));

    await deleteList();

    await waitFor(() =>
      expect(router.state.location.pathname + router.state.location.search).toBe(
        '/sign-in?next=%2Flists%2Fhousehold%2Fsunday-roasts'
      )
    );
  });
});
