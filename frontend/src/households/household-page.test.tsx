import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { components } from '../api/schema';
import { toast } from '../dino';
import { renderRoute } from '../test/render-route';
import { server } from '../test/server';

type CurrentAccount = components['schemas']['CurrentAccount'];
type Household = components['schemas']['Household'];
type Invite = components['schemas']['Invite'];
type PatchedHouseholdChanges = components['schemas']['PatchedHouseholdChanges'];

const HOUSEHOLD = '/api/household/';

const answerSignedIn = () =>
  server.use(
    http.get('/api/account/', () =>
      HttpResponse.json<CurrentAccount>({
        account: { email: 'sam@example.com', name: 'Milo', unit_system: 'metric' }
      })
    )
  );

type Rename = { body: PatchedHouseholdChanges; csrfToken: string | null };

type Removal = { id: number; csrfToken: string | null };

const MILO = { id: 1, name: 'Milo', is_you: true };
const ANN = { id: 2, name: 'Ann', is_you: false };

const BEDINIS: Household = { id: 10, name: 'The Bedinis', members: [MILO, ANN], invite: null };

// The Bedinis (or the household given) until a DELETE drops a member or a POST to leave/ moves Milo out.
const answerBedinis = (household: Household = BEDINIS) => {
  const removals: Removal[] = [];
  const leaves: { count: number } = { count: 0 };
  const state = { household };
  server.use(
    http.get(HOUSEHOLD, () => HttpResponse.json<Household>(state.household)),
    http.delete(`${HOUSEHOLD}members/:id/`, ({ params, request }) => {
      const id = Number(params.id);
      removals.push({ id, csrfToken: request.headers.get('X-CSRFToken') });
      state.household = { ...state.household, members: state.household.members.filter((member) => member.id !== id) };
      return HttpResponse.json<Household>(state.household);
    }),
    http.post(`${HOUSEHOLD}leave/`, () => {
      leaves.count += 1;
      state.household = { id: 11, name: "Milo's household", members: [MILO], invite: null };
      return HttpResponse.json<Household>(state.household);
    })
  );
  return { removals, leaves };
};

// Milo's household with Ann in it, until a PATCH renames it; records each PATCH in the order it arrives.
const answerHousehold = () => {
  const renames: Rename[] = [];
  const state: { household: Household } = {
    household: {
      id: 10,
      name: "Milo's household",
      members: [
        { id: 1, name: 'Milo', is_you: true },
        { id: 2, name: 'Ann', is_you: false }
      ],
      invite: null
    }
  };
  server.use(
    http.get(HOUSEHOLD, () => HttpResponse.json<Household>(state.household)),
    http.patch(HOUSEHOLD, async ({ request }) => {
      const body = (await request.json()) as PatchedHouseholdChanges;
      renames.push({ body, csrfToken: request.headers.get('X-CSRFToken') });
      state.household = { ...state.household, name: body.name ?? state.household.name };
      return HttpResponse.json<Household>(state.household);
    })
  );
  return renames;
};

const INVITE = `${HOUSEHOLD}invite/`;

const LIVE: Invite = { token: 'tok-123', expires_at: '2026-11-07T12:00:00Z', status: 'live' };

// The Bedinis with the invite given, until a POST makes the live link or a DELETE cancels it; counts each request.
const answerInvite = (invite: Invite | null) => {
  const sent = { makes: 0, cancels: 0, csrfTokens: [] as (string | null)[] };
  const state = { household: { ...BEDINIS, invite } };
  server.use(
    http.get(HOUSEHOLD, () => HttpResponse.json<Household>(state.household)),
    http.post(INVITE, ({ request }) => {
      sent.makes += 1;
      sent.csrfTokens.push(request.headers.get('X-CSRFToken'));
      state.household = { ...state.household, invite: LIVE };
      return HttpResponse.json<Household>(state.household);
    }),
    http.delete(INVITE, ({ request }) => {
      sent.cancels += 1;
      sent.csrfTokens.push(request.headers.get('X-CSRFToken'));
      state.household = { ...state.household, invite: null };
      return HttpResponse.json<Household>(state.household);
    })
  );
  return sent;
};

const AUTH = '/api/_allauth/browser/v1/auth';

const accounts: Partial<Record<string, { name: string; household: Household }>> = {
  'milo@example.com': {
    name: 'Milo',
    household: { id: 11, name: "Milo's household", members: [{ id: 1, name: 'Milo', is_you: true }], invite: null }
  },
  'jo@example.com': {
    name: 'Jo',
    household: { id: 12, name: "Jo's household", members: [{ id: 3, name: 'Jo', is_you: true }], invite: null }
  }
};

// A stand-in for the server with Milo signed in: a DELETE signs out, and any emailed code then signs in as Jo.
const answerTwoAccounts = () => {
  const state: { signedInAs?: string } = { signedInAs: 'milo@example.com' };
  const signedIn = () => (state.signedInAs === undefined ? undefined : accounts[state.signedInAs]);
  server.use(
    http.get('/api/account/', () => {
      const { signedInAs } = state;
      const account = signedIn();
      return HttpResponse.json<CurrentAccount>({
        account:
          signedInAs === undefined || account === undefined
            ? null
            : { email: signedInAs, name: account.name, unit_system: 'metric' }
      });
    }),
    http.get(HOUSEHOLD, () => {
      const account = signedIn();
      return account === undefined
        ? new HttpResponse(null, { status: 403 })
        : HttpResponse.json<Household>(account.household);
    }),
    http.delete(`${AUTH}/session`, () => {
      state.signedInAs = undefined;
      return HttpResponse.json(
        { status: 401, data: { flows: [] }, meta: { is_authenticated: false } },
        { status: 401 }
      );
    }),
    http.post(`${AUTH}/code/request`, () =>
      HttpResponse.json(
        {
          status: 401,
          data: { flows: [{ id: 'login_by_code', is_pending: true }] },
          meta: { is_authenticated: false }
        },
        { status: 401 }
      )
    ),
    http.post(`${AUTH}/code/confirm`, () => {
      state.signedInAs = 'jo@example.com';
      return HttpResponse.json({
        status: 200,
        data: { user: { email: 'jo@example.com' }, methods: [] },
        meta: { is_authenticated: true }
      });
    })
  );
};

const nameField = () => screen.getByRole('textbox', { name: 'Household name' });

const saveName = async (name: string) => {
  await userEvent.clear(await screen.findByRole('textbox', { name: 'Household name' }));
  if (name !== '') {
    await userEvent.type(nameField(), name);
  }
  await userEvent.click(screen.getByRole('button', { name: 'Save name' }));
};

describe('HouseholdPage', () => {
  beforeEach(() => {
    // biome-ignore lint/suspicious/noDocumentCookie: Django's account request sets this cookie; jsdom has no Cookie Store
    document.cookie = 'csrftoken=abc';
  });

  // Sonner keeps its toasts outside React, so one test's toast would still show in the next.
  afterEach(() => {
    toast.dismiss();
  });

  it("shows the household's name and its members, you first", async () => {
    answerSignedIn();
    answerHousehold();
    renderRoute('/household');

    expect(await screen.findByRole('heading', { level: 1, name: 'Your household' })).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('Your household · Tastebook'));
    expect(nameField()).toHaveValue("Milo's household");
    expect(nameField()).toHaveAccessibleDescription('Everyone in the household sees it.');
    const members = within(screen.getByRole('list', { name: 'Members' })).getAllByRole('listitem');
    // The avatar's letter comes first but is hidden from screen readers.
    expect(members).toHaveLength(2);
    expect(members[0]).toHaveTextContent(/^M ?Milo \(you\)$/);
    expect(members[1]).toHaveTextContent(/^A ?Ann/);
    expect(within(members[1] as HTMLElement).getByText('Ann', { ignore: '.sr-only' })).toBeInTheDocument();
  });

  it('shows that it is getting the household, then the household', async () => {
    answerSignedIn();
    const gate = { release: () => {} };
    const released = new Promise<void>((resolve) => {
      gate.release = resolve;
    });
    server.use(
      http.get(HOUSEHOLD, async () => {
        await released;
        return HttpResponse.json<Household>({
          id: 10,
          name: "Milo's household",
          members: [{ id: 1, name: 'Milo', is_you: true }],
          invite: null
        });
      })
    );
    renderRoute('/household');

    expect(await screen.findByText('Getting your household…')).toBeInTheDocument();

    gate.release();

    expect(await screen.findByRole('textbox', { name: 'Household name' })).toHaveValue("Milo's household");
  });

  it('saves a new name trimmed and says so', async () => {
    answerSignedIn();
    const renames = answerHousehold();
    renderRoute('/household');

    await saveName('  The Bedinis ');

    expect(await screen.findByText('Household name saved')).toBeInTheDocument();
    expect(renames).toEqual([{ body: { name: 'The Bedinis' }, csrfToken: 'abc' }]);
    expect(nameField()).toHaveValue('The Bedinis');
  });

  it.each([
    ['empty', ''],
    ['only spaces', '   ']
  ])('says how to fix a name that is %s, and sends nothing', async (_, name) => {
    answerSignedIn();
    const renames = answerHousehold();
    renderRoute('/household');

    await saveName(name);

    expect(nameField()).toHaveAccessibleDescription('Enter a name for your household, like The Bedinis.');
    expect(nameField()).toHaveFocus();
    expect(renames).toEqual([]);
  });

  it("shows the server's message for a name it refuses", async () => {
    answerSignedIn();
    answerHousehold();
    const refused = 'Ensure this field has no more than 100 characters.';
    server.use(http.patch(HOUSEHOLD, () => HttpResponse.json({ name: [refused] }, { status: 400 })));
    renderRoute('/household');

    await saveName('The Bedinis');

    await waitFor(() => expect(nameField()).toHaveAccessibleDescription(refused));
    expect(nameField()).toHaveFocus();
  });

  it.each([
    ['the server fails', () => new HttpResponse(null, { status: 500 })],
    ['the session has ended', () => new HttpResponse(null, { status: 403 })],
    ['the account has no household', () => new HttpResponse(null, { status: 404 })],
    ['the network fails', () => HttpResponse.error()]
  ])("says the name couldn't be saved and keeps it when %s", async (_, answer) => {
    answerSignedIn();
    answerHousehold();
    server.use(http.patch(HOUSEHOLD, answer));
    renderRoute('/household');

    await saveName('The Bedinis');

    expect(
      await screen.findByText("Couldn't save the household's name. Check your connection and try again.")
    ).toBeInTheDocument();
    expect(nameField()).toHaveValue('The Bedinis');
  });

  it('offers Remove beside each other member, and Leave', async () => {
    answerSignedIn();
    answerBedinis();
    renderRoute('/household');

    const [milo, ann] = within(await screen.findByRole('list', { name: 'Members' })).getAllByRole('listitem');
    expect(milo).toHaveTextContent(/^M ?Milo \(you\)$/);
    expect(ann).toHaveTextContent(/^A ?AnnRemove AnnRemoving…$/);
    expect(within(ann as HTMLElement).getByRole('button', { name: 'Remove Ann' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Leave household' })).toBeInTheDocument();
  });

  it('offers the only member neither Remove nor Leave', async () => {
    answerSignedIn();
    answerBedinis({ id: 10, name: "Milo's household", members: [MILO], invite: null });
    renderRoute('/household');

    expect(await screen.findByRole('textbox', { name: 'Household name' })).toHaveValue("Milo's household");
    expect(screen.queryByRole('button', { name: 'Leave household' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Remove/ })).not.toBeInTheDocument();
  });

  it('removes a member once asked, and says so', async () => {
    answerSignedIn();
    const { removals } = answerBedinis();
    renderRoute('/household');

    await userEvent.click(await screen.findByRole('button', { name: 'Remove Ann' }));
    const asked = await screen.findByRole('alertdialog', { name: 'Remove Ann from The Bedinis?' });
    expect(asked).toHaveAccessibleDescription(
      "Ann will move to a household of their own, and we'll email them to say you removed them."
    );
    await userEvent.click(within(asked).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(removals).toEqual([]);

    await userEvent.click(screen.getByRole('button', { name: 'Remove Ann' }));
    await userEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Remove member' })
    );

    expect(await screen.findByText('Removed Ann')).toBeInTheDocument();
    expect(removals).toEqual([{ id: 2, csrfToken: 'abc' }]);
    const members = within(screen.getByRole('list', { name: 'Members' })).getAllByRole('listitem');
    expect(members).toHaveLength(1);
    expect(members[0]).toHaveTextContent(/^M ?Milo \(you\)$/);
    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: 'Members' })).toHaveFocus());
  });

  it('says so when the member had already gone, and redraws the list', async () => {
    answerSignedIn();
    answerBedinis();
    renderRoute('/household');
    await screen.findByRole('button', { name: 'Remove Ann' });
    server.use(
      http.delete(`${HOUSEHOLD}members/:id/`, () => new HttpResponse(null, { status: 404 })),
      http.get(HOUSEHOLD, () => HttpResponse.json<Household>({ ...BEDINIS, members: [MILO] }))
    );

    await userEvent.click(screen.getByRole('button', { name: 'Remove Ann' }));
    await userEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Remove member' })
    );

    expect(await screen.findByText("Ann isn't in your household any more.")).toBeInTheDocument();
    await waitFor(() =>
      expect(within(screen.getByRole('list', { name: 'Members' })).getAllByRole('listitem')).toHaveLength(1)
    );
    expect(screen.getByRole('list', { name: 'Members' })).toHaveTextContent(/^M ?Milo \(you\)$/);
    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: 'Members' })).toHaveFocus());
  });

  it.each([
    ['the server fails', () => new HttpResponse(null, { status: 500 })],
    ['the session has ended', () => new HttpResponse(null, { status: 403 })],
    ['the network fails', () => HttpResponse.error()]
  ])("says Ann couldn't be removed and keeps her listed when %s", async (_, answer) => {
    answerSignedIn();
    answerBedinis();
    server.use(http.delete(`${HOUSEHOLD}members/:id/`, answer));
    renderRoute('/household');

    await userEvent.click(await screen.findByRole('button', { name: 'Remove Ann' }));
    await userEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Remove member' })
    );

    expect(await screen.findByText("Couldn't remove Ann. Check your connection and try again.")).toBeInTheDocument();
    expect(
      within(screen.getByRole('list', { name: 'Members' })).getByText('Ann', { ignore: '.sr-only' })
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Remove Ann' })).toHaveFocus());
  });

  it('leaves once asked, and shows the new household of one', async () => {
    answerSignedIn();
    const { leaves } = answerBedinis();
    const { router } = renderRoute('/household');

    await userEvent.click(await screen.findByRole('button', { name: 'Leave household' }));
    const asked = await screen.findByRole('alertdialog', { name: 'Leave The Bedinis?' });
    expect(asked).toHaveAccessibleDescription("You'll move to a household of your own. Ann stays in The Bedinis.");
    await userEvent.click(within(asked).getByRole('button', { name: 'Leave household' }));

    expect(await screen.findByText('You left The Bedinis')).toBeInTheDocument();
    expect(leaves.count).toBe(1);
    expect(nameField()).toHaveValue("Milo's household");
    const members = within(screen.getByRole('list', { name: 'Members' })).getAllByRole('listitem');
    expect(members).toHaveLength(1);
    expect(members[0]).toHaveTextContent(/^M ?Milo \(you\)$/);
    expect(screen.queryByRole('button', { name: 'Leave household' })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Your household' })).toHaveFocus());
    expect(router.state.location.pathname).toBe('/household');
  });

  it('names everyone who stays', async () => {
    answerSignedIn();
    answerBedinis({
      ...BEDINIS,
      members: [MILO, ANN, { id: 3, name: 'Jo', is_you: false }, { id: 4, name: 'Sam', is_you: false }]
    });
    renderRoute('/household');

    await userEvent.click(await screen.findByRole('button', { name: 'Leave household' }));

    expect(await screen.findByRole('alertdialog', { name: 'Leave The Bedinis?' })).toHaveAccessibleDescription(
      "You'll move to a household of your own. Ann, Jo and Sam stay in The Bedinis."
    );
  });

  it.each([
    ['the server fails', () => new HttpResponse(null, { status: 500 })],
    ['the session has ended', () => new HttpResponse(null, { status: 403 })],
    ['the account has no household', () => new HttpResponse(null, { status: 404 })],
    ['the network fails', () => HttpResponse.error()]
  ])("says the household couldn't be left and keeps it when %s", async (_, answer) => {
    answerSignedIn();
    answerBedinis();
    server.use(http.post(`${HOUSEHOLD}leave/`, answer));
    renderRoute('/household');

    await userEvent.click(await screen.findByRole('button', { name: 'Leave household' }));
    await userEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Leave household' })
    );

    expect(
      await screen.findByText("Couldn't leave the household. Check your connection and try again.")
    ).toBeInTheDocument();
    expect(nameField()).toHaveValue('The Bedinis');
  });

  it.each([
    ['Removing…', 'Remove Ann', 'Remove member', http.delete, `${HOUSEHOLD}members/:id/`, 'Removed Ann'],
    ['Leaving…', 'Leave household', 'Leave household', http.post, `${HOUSEHOLD}leave/`, 'You left The Bedinis']
  ])('shows %s on the %s trigger until the server answers', async (busy, trigger, confirm, method, path, done) => {
    answerSignedIn();
    answerBedinis();
    const gate = { release: () => {} };
    const released = new Promise<void>((resolve) => {
      gate.release = resolve;
    });
    // Holds the request, then lets answerBedinis's handler answer it.
    server.use(
      method(path, async () => {
        await released;
        return undefined;
      })
    );
    renderRoute('/household');

    await userEvent.click(await screen.findByRole('button', { name: trigger }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: confirm }));

    const pending = await screen.findByRole('button', { name: busy });
    expect(pending).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(pending);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    gate.release();

    expect(await screen.findByText(done)).toBeInTheDocument();
  });

  it('makes an invite link and shows it with the day it stops working', async () => {
    answerSignedIn();
    const sent = answerInvite(null);
    renderRoute('/household');

    expect(
      await screen.findByText('Make a link to invite someone. It works for 7 days, for anyone you send it to.')
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Make invite link' }));

    const link = await screen.findByRole('textbox', { name: 'Invite link' });
    expect(link).toHaveValue(`${window.location.origin}/join/tok-123`);
    expect(link).toHaveAccessibleDescription('Anyone with this link can join until 7 November.');
    expect(link).toHaveAttribute('readonly');
    await waitFor(() => expect(link).toHaveFocus());
    expect(sent).toEqual({ makes: 1, cancels: 0, csrfTokens: ['abc'] });
    expect(screen.queryByRole('button', { name: 'Make invite link' })).not.toBeInTheDocument();
  });

  it('copies the link and says so', async () => {
    const user = userEvent.setup();
    answerSignedIn();
    answerInvite(LIVE);
    renderRoute('/household');

    await user.click(await screen.findByRole('button', { name: 'Copy link' }));

    expect(await screen.findByText('Link copied')).toBeInTheDocument();
    expect(await navigator.clipboard.readText()).toBe(`${window.location.origin}/join/tok-123`);
  });

  it('says to copy the link by hand when the clipboard refuses it', async () => {
    const user = userEvent.setup();
    answerSignedIn();
    answerInvite(LIVE);
    renderRoute('/household');
    const link = await screen.findByRole('textbox', { name: 'Invite link' });
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(new DOMException('Denied', 'NotAllowedError'));

    await user.click(screen.getByRole('button', { name: 'Copy link' }));

    expect(await screen.findByText("Couldn't copy the link. Select it and copy it yourself.")).toBeInTheDocument();
    expect(screen.queryByText('Link copied')).not.toBeInTheDocument();
    expect(link).toHaveValue(`${window.location.origin}/join/tok-123`);
  });

  it('cancels the link only once asked, and says so', async () => {
    answerSignedIn();
    const sent = answerInvite(LIVE);
    renderRoute('/household');

    await userEvent.click(await screen.findByRole('button', { name: 'Cancel link' }));
    const asked = await screen.findByRole('alertdialog', { name: 'Cancel this invite link?' });
    expect(asked).toHaveAccessibleDescription(
      'Anyone who opens it will be told it no longer works. You can make a new link afterwards.'
    );
    await userEvent.click(within(asked).getByRole('button', { name: 'Keep link' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(sent.cancels).toBe(0);
    expect(screen.getByRole('textbox', { name: 'Invite link' })).toHaveValue(`${window.location.origin}/join/tok-123`);

    await userEvent.click(screen.getByRole('button', { name: 'Cancel link' }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancel link' }));

    expect(await screen.findByText('Link cancelled')).toBeInTheDocument();
    const makeAgain = await screen.findByRole('button', { name: 'Make invite link' });
    await waitFor(() => expect(makeAgain).toHaveFocus());
    expect(screen.queryByRole('textbox', { name: 'Invite link' })).not.toBeInTheDocument();
    expect(sent).toEqual({ makes: 0, cancels: 1, csrfTokens: ['abc'] });
  });

  it('says when the link expired, and offers only a new one', async () => {
    answerSignedIn();
    const sent = answerInvite({ ...LIVE, status: 'expired' });
    renderRoute('/household');

    expect(await screen.findByText('This invite link expired on 7 November.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copy link' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel link' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Invite link' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Make a new link' }));

    expect(await screen.findByRole('textbox', { name: 'Invite link' })).toHaveValue(
      `${window.location.origin}/join/tok-123`
    );
    expect(sent.makes).toBe(1);
  });

  it.each(
    [
      {
        action: 'make',
        invite: null,
        press: async () => userEvent.click(await screen.findByRole('button', { name: 'Make invite link' })),
        message: "Couldn't make a link. Check your connection and try again.",
        unchanged: () => screen.getByRole('button', { name: 'Make invite link' }),
        focused: () => screen.getByRole('button', { name: 'Make invite link' })
      },
      {
        action: 'cancel',
        invite: LIVE,
        press: async () => {
          await userEvent.click(await screen.findByRole('button', { name: 'Cancel link' }));
          await userEvent.click(
            within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancel link' })
          );
        },
        message: "Couldn't cancel the link. Check your connection and try again.",
        unchanged: () => screen.getByRole('textbox', { name: 'Invite link' }),
        focused: () => screen.getByRole('button', { name: 'Cancel link' })
      }
    ].flatMap((failure) => [
      { ...failure, status: 500 },
      { ...failure, status: 403 }
    ])
  )(
    "says it couldn't $action the link on a $status, and leaves it as it was",
    async ({ invite, press, message, unchanged, focused, status }) => {
      answerSignedIn();
      answerInvite(invite);
      server.use(
        http.post(INVITE, () => new HttpResponse(null, { status })),
        http.delete(INVITE, () => new HttpResponse(null, { status }))
      );
      renderRoute('/household');

      await press();

      expect(await screen.findByText(message)).toBeInTheDocument();
      expect(unchanged()).toBeInTheDocument();
      await waitFor(() => expect(focused()).toHaveFocus());
    }
  );

  it('shows that it is cancelling the link until the server answers', async () => {
    answerSignedIn();
    answerInvite(LIVE);
    const gate = { release: () => {} };
    const released = new Promise<void>((resolve) => {
      gate.release = resolve;
    });
    server.use(
      http.delete(INVITE, async () => {
        await released;
        return HttpResponse.json<Household>({ ...BEDINIS, invite: null });
      })
    );
    renderRoute('/household');

    await userEvent.click(await screen.findByRole('button', { name: 'Cancel link' }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancel link' }));

    const cancelling = await screen.findByRole('button', { name: 'Cancelling…' });
    expect(cancelling).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(cancelling);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    gate.release();

    expect(await screen.findByText('Link cancelled')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Make invite link' })).toBeInTheDocument();
  });

  it.each([
    {
      action: 'making',
      invite: null,
      press: async () => userEvent.click(await screen.findByRole('button', { name: 'Make invite link' }))
    },
    {
      action: 'cancelling',
      invite: LIVE,
      press: async () => {
        await userEvent.click(await screen.findByRole('button', { name: 'Cancel link' }));
        await userEvent.click(
          within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancel link' })
        );
      }
    }
  ])('shows the household Milo was moved to when $action the link finds him gone', async ({ invite, press }) => {
    answerSignedIn();
    answerInvite(invite);
    renderRoute('/household');
    await screen.findByRole('heading', { level: 2, name: 'Invite someone' });
    server.use(
      http.post(INVITE, () => new HttpResponse(null, { status: 404 })),
      http.delete(INVITE, () => new HttpResponse(null, { status: 404 })),
      http.get(HOUSEHOLD, () =>
        HttpResponse.json<Household>({ id: 11, name: "Milo's household", members: [MILO], invite: null })
      )
    );

    await press();

    await waitFor(() => expect(nameField()).toHaveValue("Milo's household"));
    expect(within(screen.getByRole('list', { name: 'Members' })).getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Make invite link' })).toBeInTheDocument();
    expect(screen.queryByText(/Check your connection/)).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Your household' })).toHaveFocus());
  });

  it("says the household couldn't be loaded, and tries again", async () => {
    answerSignedIn();
    server.use(http.get(HOUSEHOLD, () => new HttpResponse(null, { status: 500 })));
    renderRoute('/household');

    const failed = await screen.findByRole('alert');
    expect(failed).toHaveTextContent("Couldn't load your household");
    expect(failed).toHaveTextContent('Check your connection and try again.');

    answerHousehold();
    await userEvent.click(within(failed).getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('textbox', { name: 'Household name' })).toHaveValue("Milo's household");
  });

  it('sends a visitor to sign in, and back here after, without asking for a household', async () => {
    const asked = { count: 0 };
    server.use(
      http.get(HOUSEHOLD, () => {
        asked.count += 1;
        return new HttpResponse(null, { status: 403 });
      })
    );
    const { router, queryClient } = renderRoute('/household');

    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
    expect(router.state.location.pathname + router.state.location.search).toBe('/sign-in?next=%2Fhousehold');
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));
    expect(asked.count).toBe(0);
  });

  it("shows the next account its own household after signing out, not the last one's", async () => {
    answerTwoAccounts();
    const { queryClient } = renderRoute('/household');
    expect(await screen.findByRole('textbox', { name: 'Household name' })).toHaveValue("Milo's household");

    await userEvent.click(screen.getByRole('button', { name: 'Account for Milo' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Sign out' }));
    await userEvent.type(await screen.findByRole('textbox', { name: 'Email address' }), 'jo@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Send code' }));
    await userEvent.type(await screen.findByRole('textbox', { name: 'Code' }), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Your household' })).toBeInTheDocument();
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));
    expect(nameField()).toHaveValue("Jo's household");
    const members = screen.getByRole('list', { name: 'Members' });
    expect(within(members).getByText('Jo')).toBeInTheDocument();
    expect(within(members).queryByText('Milo')).not.toBeInTheDocument();
  });
});
