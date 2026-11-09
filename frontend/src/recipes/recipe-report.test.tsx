import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';

import type { components } from '../api/schema';
import { renderRoute } from '../test/render-route';
import { server } from '../test/server';

type Recipe = components['schemas']['Recipe'];
type RecipeSummary = components['schemas']['RecipeSummary'];
type CurrentAccount = components['schemas']['CurrentAccount'];
type NewReport = components['schemas']['NewReport'];
type ReportOutcome = components['schemas']['ReportOutcome'];

const curry: Recipe = {
  id: 7,
  slug: 'grandmas-curry-k7m2qx',
  visibility: 'public',
  author: 'Sam',
  title: "Grandma's curry",
  description: "Sam's grandma's Sunday curry.",
  cuisines: [{ slug: 'indian', name: 'Indian' }],
  adapted_from: null,
  is_copy: false,
  courses: [],
  difficulty: 'easy',
  prep_minutes: 20,
  cook_minutes: 40,
  extra_minutes: 0,
  extra_label: '',
  total_minutes: 60,
  photo: null,
  diet_tags: [],
  servings: 4,
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
  can_report: true,
  reported: false
};

const PATH = `/recipes/${curry.slug}`;
const NOTE = "Word for word from Meera Sodha's Made in India, page 112.";
const NOT_SENT = "Couldn't send the report. Check your connection, then try again.";

const answerSession = (signedIn: () => boolean) =>
  server.use(
    http.get('/api/account/', () =>
      HttpResponse.json<CurrentAccount>({
        account: signedIn() ? { email: 'milo@example.com', name: 'Milo', unit_system: 'metric' } : null
      })
    )
  );

// Signed in as Milo, of another household; answers the curry's page with `shown` (404 once it's null) and each report
// with `answer`, recording the body of each sent.
const answerReporting = (shown: { recipe: Recipe | null }, answer: () => Response | Promise<Response>) => {
  const sent: NewReport[] = [];
  answerSession(() => true);
  server.use(
    http.get('/api/recipes/:slug/', () =>
      shown.recipe === null ? new HttpResponse(null, { status: 404 }) : HttpResponse.json<Recipe>(shown.recipe)
    ),
    http.post('/api/recipes/:slug/report/', async ({ request }) => {
      sent.push((await request.json()) as NewReport);
      return answer();
    })
  );
  return sent;
};

const hid = (hidden: boolean) => () => HttpResponse.json<ReportOutcome>({ hidden }, { status: 201 });

const openSheet = async () => {
  const rendered = renderRoute(PATH);
  await userEvent.click(await screen.findByRole('button', { name: 'Report recipe' }));
  return { ...rendered, sheet: await screen.findByRole('dialog', { name: 'Report recipe' }) };
};

const fillIn = async (sheet: HTMLElement) => {
  await userEvent.click(within(sheet).getByRole('radio', { name: 'Copied without credit' }));
  await userEvent.type(within(sheet).getByRole('textbox', { name: 'Note' }), NOTE);
};

const send = (sheet: HTMLElement) => userEvent.click(within(sheet).getByRole('button', { name: 'Send report' }));

describe('Reporting a recipe', () => {
  it('offers Report recipe where the page allows it, and not on your own recipe', async () => {
    answerSession(() => true);
    server.use(
      http.get('/api/recipes/:slug/', ({ params }) =>
        HttpResponse.json<Recipe>(
          params.slug === curry.slug
            ? curry
            : { ...curry, slug: 'miloss-dal-d4l9xz', title: "Milo's dal", can_report: false }
        )
      )
    );
    const { router, queryClient } = renderRoute(PATH);

    expect(await screen.findByRole('button', { name: 'Report recipe' })).toHaveAttribute('aria-haspopup', 'dialog');

    await act(() => router.navigate('/recipes/miloss-dal-d4l9xz'));
    expect(await screen.findByRole('heading', { level: 1, name: /dal/ })).toBeInTheDocument();
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));
    expect(screen.queryByRole('button', { name: 'Report recipe' })).not.toBeInTheDocument();
  });

  it('opens a sheet naming the recipe and its author, with focus on the first reason', async () => {
    const sent = answerReporting({ recipe: curry }, hid(true));

    const { sheet } = await openSheet();

    expect(sheet).toHaveAccessibleDescription("Grandma's curry, by Sam");
    expect(within(sheet).getByRole('group', { name: "What's wrong with it?" })).toBeInTheDocument();
    expect(
      within(sheet)
        .getAllByRole('radio')
        .map((radio) => radio.getAttribute('value'))
    ).toEqual(['spam', 'offensive', 'copied', 'other']);
    expect(within(sheet).getByRole('radio', { name: 'Copied without credit' })).toHaveAccessibleDescription(
      "Someone else's recipe, passed off as theirs"
    );
    expect(within(sheet).getByRole('textbox', { name: 'Note' })).toHaveAttribute('maxlength', '500');
    await waitFor(() => expect(within(sheet).getByRole('radio', { name: 'Spam' })).toHaveFocus());
    expect(sent).toEqual([]);
  });

  it('sends nothing without a reason, and says to choose one', async () => {
    const sent = answerReporting({ recipe: curry }, hid(true));
    const { sheet } = await openSheet();

    await send(sheet);

    const spam = within(sheet).getByRole('radio', { name: 'Spam' });
    expect(spam).toHaveFocus();
    expect(spam).toHaveAccessibleDescription("Adverts, links, or not a recipe Choose what's wrong with it, like Spam.");
    expect(sent).toEqual([]);

    await userEvent.click(within(sheet).getByRole('radio', { name: 'Offensive' }));
    expect(within(sheet).queryByText("Choose what's wrong with it, like Spam.")).not.toBeInTheDocument();
  });

  it('sends the reason and note, and takes you back to All recipes once the report hides the recipe', async () => {
    const shown: { recipe: Recipe | null } = { recipe: curry };
    const sent = answerReporting(shown, () => {
      shown.recipe = null;
      return hid(true)();
    });
    const { router, sheet } = await openSheet();
    await fillIn(sheet);

    await send(sheet);

    expect(
      await screen.findByText("Reported Grandma's curry. It's hidden while staff look at it.")
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/recipes');
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1, name: /What shall we +cook +tonight\?/ })).toHaveFocus()
    );
    expect(sent).toEqual([{ reason: 'copied', note: NOTE }]);
  });

  it('takes you back to the list you opened the recipe from', async () => {
    answerReporting({ recipe: curry }, hid(true));
    const { router } = renderRoute('/recipes');
    await act(() =>
      router.navigate(PATH, { state: { openedFrom: { name: 'Weeknight dinners', path: '/lists/weeknight-dinners' } } })
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Report recipe' }));
    const sheet = await screen.findByRole('dialog', { name: 'Report recipe' });
    await fillIn(sheet);

    await send(sheet);

    await waitFor(() => expect(router.state.location.pathname).toBe('/lists/weeknight-dinners'));
  });

  it('leaves a recipe staff restored up, and says you reported it', async () => {
    const sent = answerReporting({ recipe: curry }, hid(false));
    const { router, sheet } = await openSheet();
    await fillIn(sheet);

    await send(sheet);

    expect(await screen.findByText("Reported Grandma's curry. Staff will look at it.")).toBeInTheDocument();
    const reported = screen.getByRole('button', { name: 'Reported' });
    expect(reported).toHaveAttribute('aria-disabled', 'true');
    expect(reported).toHaveAccessibleDescription("You've reported this recipe. Staff have it.");
    await waitFor(() => expect(reported).toHaveFocus());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe(PATH);
    expect(sent).toHaveLength(1);
  });

  it('shows the report is sending while it is', async () => {
    const gate = { release: () => {} };
    const released = new Promise<void>((resolve) => {
      gate.release = resolve;
    });
    answerReporting({ recipe: curry }, async () => {
      await released;
      return hid(false)();
    });
    const { sheet } = await openSheet();
    await fillIn(sheet);

    await send(sheet);

    expect(await within(sheet).findByRole('button', { name: 'Sending…' })).toHaveAttribute('aria-busy', 'true');
    gate.release();
    expect(await screen.findByText("Reported Grandma's curry. Staff will look at it.")).toBeInTheDocument();
  });

  it('shows Reported on a recipe you reported already', async () => {
    answerReporting({ recipe: { ...curry, reported: true } }, hid(false));
    renderRoute(PATH);

    const reported = await screen.findByRole('button', { name: 'Reported' });

    expect(reported).toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByRole('button', { name: 'Report recipe' })).not.toBeInTheDocument();
  });

  it('says why when Tastebook refuses the report, and shows it reported once it was', async () => {
    const shown = { recipe: curry };
    answerReporting(shown, () => {
      shown.recipe = { ...curry, reported: true };
      return HttpResponse.json({ non_field_errors: ["You've reported this recipe already."] }, { status: 400 });
    });
    const { sheet } = await openSheet();
    await fillIn(sheet);

    await send(sheet);

    expect(await within(sheet).findByRole('alert')).toHaveTextContent("You've reported this recipe already.");
    expect(await screen.findByRole('button', { name: 'Reported', hidden: true })).toBeInTheDocument();
  });

  it('says the recipe has gone when Tastebook can’t find it, and puts focus on the heading', async () => {
    const shown: { recipe: Recipe | null } = { recipe: curry };
    answerReporting(shown, () => {
      shown.recipe = null;
      return new HttpResponse(null, { status: 404 });
    });
    const { router, sheet } = await openSheet();
    await fillIn(sheet);

    await send(sheet);

    expect(
      await screen.findByText("Grandma's curry has been deleted, or you can't see it any more.")
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Recipe not found' })).toHaveFocus());
    expect(router.state.location.pathname).toBe(PATH);
  });

  it('sends you to sign in first when you are signed out, and opens the sheet on the way back', async () => {
    const sent = answerReporting({ recipe: curry }, hid(true));
    const state = { signedIn: false };
    answerSession(() => state.signedIn);
    const { router } = renderRoute(PATH);

    await userEvent.click(await screen.findByRole('button', { name: 'Report recipe' }));

    await waitFor(() =>
      expect(router.state.location.pathname + router.state.location.search).toBe(
        '/sign-in?next=%2Frecipes%2Fgrandmas-curry-k7m2qx%3Freport%3Dopen'
      )
    );
    expect(sent).toEqual([]);

    state.signedIn = true;
    renderRoute(`${PATH}?report=open`);
    const sheet = await screen.findByRole('dialog', { name: 'Report recipe' });
    await userEvent.click(within(sheet).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('sends you to sign in, and back to the sheet after, when Tastebook says you are signed out', async () => {
    const state = { signedOut: false };
    answerReporting({ recipe: curry }, () => {
      state.signedOut = true;
      return new HttpResponse(null, { status: 403 });
    });
    answerSession(() => !state.signedOut);
    const { router, sheet } = await openSheet();
    await fillIn(sheet);

    await send(sheet);

    await waitFor(() =>
      expect(router.state.location.pathname + router.state.location.search).toBe(
        '/sign-in?next=%2Frecipes%2Fgrandmas-curry-k7m2qx%3Freport%3Dopen'
      )
    );
  });

  it.each<[string, () => Response]>([
    ['refused while still signed in', () => new HttpResponse(null, { status: 403 })],
    ['answered with a server error', () => new HttpResponse(null, { status: 500 })],
    ['not answered', () => HttpResponse.error()]
  ])('says the report didn’t send when the request is %s, and keeps what you chose', async (_, answer) => {
    answerReporting({ recipe: curry }, answer);
    const { sheet } = await openSheet();
    await fillIn(sheet);

    await send(sheet);

    expect(await within(sheet).findByRole('alert')).toHaveTextContent(NOT_SENT);
    expect(within(sheet).getByRole('radio', { name: 'Copied without credit' })).toBeChecked();
    expect(within(sheet).getByRole('textbox', { name: 'Note' })).toHaveValue(NOTE);
  });
});

const authorsCurry: Recipe = {
  ...curry,
  hidden_for_review: true,
  can_report: false,
  can_edit: true,
  can_delete: true,
  can_publish: true,
  will_wait_for_review: false,
  save_count: 0
};

describe("The author's hidden recipe", () => {
  it('says why nobody else can see it, and holds it public until staff review it', async () => {
    answerSession(() => true);
    server.use(http.get('/api/recipes/:slug/', () => HttpResponse.json<Recipe>(authorsCurry)));
    renderRoute(PATH);

    const notice = (await screen.findByText('Hidden while a report is reviewed')).closest('[role="status"]');

    expect(notice).toHaveTextContent(
      'Hidden while a report is reviewedSomeone reported this recipe, so only you can see it until staff have looked at it. You can still edit or delete it.'
    );
    const publicSwitch = screen.getByRole('switch', { name: 'Public' });
    expect(publicSwitch).toBeChecked();
    expect(publicSwitch).toHaveAttribute('aria-disabled', 'true');
    expect(publicSwitch).toHaveAccessibleDescription('You can change this once staff have reviewed the report.');
    expect(screen.getByRole('link', { name: 'Edit recipe' })).toBeInTheDocument();
  });

  it('shows no notice on a recipe no report hides', async () => {
    answerSession(() => true);
    server.use(
      http.get('/api/recipes/:slug/', () => HttpResponse.json<Recipe>({ ...authorsCurry, hidden_for_review: false }))
    );
    const { queryClient } = renderRoute(PATH);

    expect(await screen.findByRole('switch', { name: 'Public' })).not.toHaveAttribute('aria-disabled');
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));
    expect(screen.queryByText('Hidden while a report is reviewed')).not.toBeInTheDocument();
  });

  it('says on its card that it is hidden for review', async () => {
    const summary = (fields: Partial<RecipeSummary>): RecipeSummary => ({
      id: 7,
      slug: curry.slug,
      visibility: 'public',
      author: 'Sam',
      title: "Grandma's curry",
      description: '',
      cuisines: [{ slug: 'indian', name: 'Indian' }],
      difficulty: 'easy',
      total_minutes: 60,
      photo: null,
      diet_tags: [],
      hidden_for_review: false,
      waiting_for_review: false,
      ...fields
    });
    server.use(
      http.get('/api/recipes/', () =>
        HttpResponse.json<RecipeSummary[]>([
          summary({ hidden_for_review: true }),
          summary({ id: 8, slug: 'sams-dal-d4l9xz', title: "Sam's dal" })
        ])
      )
    );
    renderRoute('/recipes');

    const hidden = await screen.findByRole('link', { name: "Grandma's curry" });
    const shown = screen.getByRole('link', { name: "Sam's dal" });

    expect(hidden).toHaveAccessibleDescription('Hidden for review 1 hr · Easy · Indian');
    expect(shown).toHaveAccessibleDescription('by Sam 1 hr · Easy · Indian');
  });
});
