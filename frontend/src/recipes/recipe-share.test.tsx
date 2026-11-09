import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { components } from '../api/schema';
import { toast } from '../dino';
import { renderRoute } from '../test/render-route';
import { server } from '../test/server';

type Recipe = components['schemas']['Recipe'];
type CurrentAccount = components['schemas']['CurrentAccount'];

const curry: Recipe = {
  id: 9,
  slug: 'grandmas-curry-k7m2qx',
  visibility: 'private',
  author: null,
  title: "Grandma's curry",
  description: "Sam's grandma's Sunday curry, slow and mild.",
  cuisines: [],
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
  can_delete: true,
  can_edit: true,
  can_publish: true,
  will_wait_for_review: false,
  save_count: 0,
  can_share: true,
  share_token: null,
  hidden_for_review: false,
  waiting_for_review: false,
  can_report: false,
  reported: false
};

const TOKEN = 'q8Zr2LwT4mVxN3kP';
const sharedCurry: Recipe = { ...curry, share_token: TOKEN };
const ADDRESS = `${window.location.origin}/shared/${TOKEN}`;
const HELP =
  "Anyone you send the link to can see this recipe, without signing in. They see nothing else of your household's.";

const answerSession = (signedIn: () => boolean) =>
  server.use(
    http.get('/api/account/', () =>
      HttpResponse.json<CurrentAccount>({
        account: signedIn() ? { email: 'sam@example.com', name: 'Sam', unit_system: 'metric' } : null
      })
    )
  );

type Answer = () => Response | Promise<Response>;

// Signed in as Sam, the curry's author; answers its page with `shown`, and each PUT and DELETE of its share link with
// its answer, recording what was sent.
const answerSharing = (shown: { recipe: Recipe | null }, answers: { on?: Answer; off?: Answer }) => {
  const sent: string[] = [];
  const failing = () => new HttpResponse(null, { status: 500 });
  answerSession(() => true);
  server.use(
    http.get('/api/recipes/:slug/', () =>
      shown.recipe === null ? new HttpResponse(null, { status: 404 }) : HttpResponse.json<Recipe>(shown.recipe)
    ),
    http.put('/api/recipes/:slug/share-link/', () => {
      sent.push('on');
      return (answers.on ?? failing)();
    }),
    http.delete('/api/recipes/:slug/share-link/', () => {
      sent.push('off');
      return (answers.off ?? failing)();
    })
  );
  return sent;
};

const shareSwitch = () => screen.getByRole('switch', { name: 'Share by link' });
const switchBehindDialog = () => screen.getByRole('switch', { name: 'Share by link', hidden: true });

const openCurry = async () => {
  const rendered = renderRoute('/recipes/grandmas-curry-k7m2qx');
  await screen.findByRole('switch', { name: 'Share by link' });
  return rendered;
};

const askToTurnOff = async () => {
  await userEvent.click(shareSwitch());
  return screen.findByRole('alertdialog', { name: 'Turn off the share link?' });
};

const confirmTurnOff = async () => {
  const dialog = await askToTurnOff();
  await userEvent.click(within(dialog).getByRole('button', { name: 'Turn off link' }));
};

const NOT_ON = "Couldn't turn on the share link. Check your connection and try again.";
const NOT_OFF = "Couldn't turn off the share link. Check your connection and try again.";
const GONE = "Grandma's curry has been deleted, or you can't change it any more.";

describe('Sharing a recipe by link', () => {
  afterEach(() => {
    toast.dismiss();
  });

  it('shows its author the switch, off, saying what it does', async () => {
    answerSharing({ recipe: curry }, {});
    await openCurry();

    expect(shareSwitch()).not.toBeChecked();
    expect(shareSwitch()).toHaveAccessibleDescription(HELP);
    expect(screen.queryByRole('textbox', { name: 'Share link' })).not.toBeInTheDocument();
  });

  it.each<[string, Partial<Recipe>]>([
    ['another member', { can_publish: false, can_share: false, can_edit: true }],
    ['its author once it is public', { visibility: 'public', author: 'Sam', can_share: false }]
  ])('shows %s no share switch', async (_, changes) => {
    answerSharing({ recipe: { ...curry, ...changes } }, {});
    const { queryClient } = renderRoute('/recipes/grandmas-curry-k7m2qx');

    expect(await screen.findByRole('heading', { level: 1, name: "Grandma's curry" })).toBeInTheDocument();
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));
    expect(screen.queryByRole('switch', { name: 'Share by link' })).not.toBeInTheDocument();
  });

  it('turns the link on at once, saying Saving… until it exists, then shows it', async () => {
    const gate = { release: () => {} };
    const released = new Promise<void>((resolve) => {
      gate.release = resolve;
    });
    const sent = answerSharing(
      { recipe: curry },
      {
        on: async () => {
          await released;
          return HttpResponse.json<Recipe>(sharedCurry);
        }
      }
    );
    await openCurry();

    await userEvent.click(shareSwitch());

    expect(await screen.findByText('Saving…')).toBeInTheDocument();
    expect(shareSwitch()).toHaveAttribute('aria-disabled', 'true');
    expect(shareSwitch()).toHaveAccessibleDescription('Saving…');
    expect(shareSwitch()).not.toBeChecked();
    gate.release();

    expect(await screen.findByRole('textbox', { name: 'Share link' })).toHaveValue(ADDRESS);
    expect(screen.getByRole('textbox', { name: 'Share link' })).toHaveAccessibleDescription(
      'Turn it off and the link stops working.'
    );
    expect(shareSwitch()).toBeChecked();
    expect(shareSwitch()).toHaveAccessibleDescription(HELP);
    expect(shareSwitch()).toHaveFocus();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(sent).toEqual(['on']);
  });

  it('copies the link, and says so', async () => {
    const user = userEvent.setup();
    answerSharing({ recipe: sharedCurry }, {});
    await openCurry();

    await user.click(screen.getByRole('button', { name: 'Copy link' }));

    expect(await screen.findByText('Link copied')).toBeInTheDocument();
    expect(await navigator.clipboard.readText()).toBe(ADDRESS);
    expect(screen.getByRole('button', { name: 'Copy link' })).toHaveFocus();
  });

  it('says to copy the link by hand when the clipboard refuses it, and selects it all on focus', async () => {
    const user = userEvent.setup();
    answerSharing({ recipe: sharedCurry }, {});
    await openCurry();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(new DOMException('Denied', 'NotAllowedError'));

    await user.click(screen.getByRole('button', { name: 'Copy link' }));
    expect(await screen.findByText("Couldn't copy the link. Select it and copy it yourself.")).toBeInTheDocument();
    expect(screen.queryByText('Link copied')).not.toBeInTheDocument();

    const field = screen.getByRole<HTMLInputElement>('textbox', { name: 'Share link' });
    await user.click(field);
    expect([field.selectionStart, field.selectionEnd]).toEqual([0, ADDRESS.length]);
  });

  it('asks before turning it off, and Keep link sends nothing', async () => {
    const sent = answerSharing({ recipe: sharedCurry }, {});
    await openCurry();

    const dialog = await askToTurnOff();

    expect(dialog).toHaveAccessibleDescription(
      "Anyone who opens it will be told the recipe isn't found. Turning it on again makes a new link."
    );
    expect(within(dialog).getByRole('button', { name: 'Keep link' })).toHaveFocus();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep link' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    await waitFor(() => expect(shareSwitch()).toHaveFocus());
    expect(shareSwitch()).toBeChecked();
    expect(screen.getByRole('textbox', { name: 'Share link' })).toHaveValue(ADDRESS);
    expect(sent).toEqual([]);
  });

  it('turns it off once confirmed, and the link goes', async () => {
    const gate = { release: () => {} };
    const released = new Promise<void>((resolve) => {
      gate.release = resolve;
    });
    const sent = answerSharing(
      { recipe: sharedCurry },
      {
        off: async () => {
          await released;
          return HttpResponse.json<Recipe>(curry);
        }
      }
    );
    await openCurry();

    await confirmTurnOff();

    const dialog = screen.getByRole('alertdialog', { name: 'Turn off the share link?' });
    expect(await within(dialog).findByRole('button', { name: 'Turning off…' })).toHaveAttribute('aria-busy', 'true');
    expect(switchBehindDialog()).toBeChecked();
    gate.release();

    expect(await screen.findByText('Share link turned off')).toBeInTheDocument();
    expect(sent).toEqual(['off']);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(shareSwitch()).not.toBeChecked();
    expect(screen.queryByRole('textbox', { name: 'Share link' })).not.toBeInTheDocument();
    await waitFor(() => expect(shareSwitch()).toHaveFocus());
  });

  it.each<[string, Answer, string]>([
    ['refused while still signed in', () => new HttpResponse(null, { status: 403 }), NOT_ON],
    ['answered with a server error', () => new HttpResponse(null, { status: 500 }), NOT_ON],
    ['not answered', () => HttpResponse.error(), NOT_ON]
  ])('says the link is still off when turning it on is %s', async (_, answer, message) => {
    answerSharing({ recipe: curry }, { on: answer });
    await openCurry();

    await userEvent.click(shareSwitch());

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(shareSwitch()).not.toBeChecked();
    expect(screen.queryByRole('textbox', { name: 'Share link' })).not.toBeInTheDocument();
    await waitFor(() => expect(shareSwitch()).toHaveFocus());
  });

  it.each<[string, Answer]>([
    ['refused while still signed in', () => new HttpResponse(null, { status: 403 })],
    ['answered with a server error', () => new HttpResponse(null, { status: 500 })],
    ['not answered', () => HttpResponse.error()]
  ])('says the link still works when turning it off is %s', async (_, answer) => {
    answerSharing({ recipe: sharedCurry }, { off: answer });
    await openCurry();

    await confirmTurnOff();

    expect(await screen.findByText(NOT_OFF)).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(shareSwitch()).toBeChecked();
    expect(screen.getByRole('textbox', { name: 'Share link' })).toHaveValue(ADDRESS);
    await waitFor(() => expect(shareSwitch()).toHaveFocus());
  });

  it('says the recipe is public when Tastebook refuses the link, and takes the switch away', async () => {
    const shown = { recipe: curry };
    answerSharing(shown, {
      on: () => {
        shown.recipe = { ...curry, visibility: 'public', author: 'Sam', can_share: false };
        return HttpResponse.json(
          { share_link: ['A public recipe is open to anyone already, so it has no share link.'] },
          { status: 400 }
        );
      }
    });
    await openCurry();

    await userEvent.click(shareSwitch());

    expect(
      await screen.findByText('A public recipe is open to anyone already, so it has no share link.')
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: "Grandma's curry" })).toHaveFocus());
    expect(screen.queryByRole('switch', { name: 'Share by link' })).not.toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Public' })).toBeChecked();
  });

  it.each<[string, 'on' | 'off', Recipe, Recipe | null, string]>([
    ['deleted', 'on', curry, null, 'Recipe not found'],
    ['no longer the author’s', 'on', curry, { ...curry, can_publish: false, can_share: false }, "Grandma's curry"],
    ['deleted', 'off', sharedCurry, null, 'Recipe not found'],
    [
      'no longer the author’s',
      'off',
      sharedCurry,
      { ...curry, can_publish: false, can_share: false },
      "Grandma's curry"
    ]
  ])(
    'says the recipe was %s meanwhile when turning it %s, and puts focus on the heading',
    async (_, way, before, after, heading) => {
      const shown: { recipe: Recipe | null } = { recipe: before };
      const gone = () => {
        shown.recipe = after;
        return new HttpResponse(null, { status: 404 });
      };
      answerSharing(shown, { on: gone, off: gone });
      await openCurry();

      if (way === 'on') {
        await userEvent.click(shareSwitch());
      } else {
        await confirmTurnOff();
      }

      expect(await screen.findByText(GONE)).toBeInTheDocument();
      await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: heading })).toHaveFocus());
      expect(screen.queryByRole('switch', { name: 'Share by link' })).not.toBeInTheDocument();
    }
  );

  it.each<['on' | 'off', Recipe]>([
    ['on', curry],
    ['off', sharedCurry]
  ])('sends you to sign in, and back to the recipe after, when signed out turning it %s', async (way, before) => {
    const state = { signedOut: false };
    const signedOut = () => {
      state.signedOut = true;
      return new HttpResponse(null, { status: 403 });
    };
    answerSharing({ recipe: before }, { on: signedOut, off: signedOut });
    answerSession(() => !state.signedOut);
    const { router } = await openCurry();

    if (way === 'on') {
      await userEvent.click(shareSwitch());
    } else {
      await confirmTurnOff();
    }

    await waitFor(() =>
      expect(router.state.location.pathname + router.state.location.search).toBe(
        '/sign-in?next=%2Frecipes%2Fgrandmas-curry-k7m2qx'
      )
    );
  });
});
