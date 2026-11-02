import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { components } from '../api/schema';
import { toast } from '../dino';
import { renderRoute } from '../test/render-route';
import { server } from '../test/server';

type CurrentAccount = components['schemas']['CurrentAccount'];
type Household = components['schemas']['Household'];
type JoinInvite = components['schemas']['JoinInvite'];

const LOOKUP = '/api/invites/tok-123/';
const JOIN = '/api/invites/tok-123/join/';
const HOUSEHOLD = '/api/household/';

const MILO = { id: 1, name: 'Milo', is_you: true };
const ANN = { id: 2, name: 'Ann', is_you: false };
const JO = { id: 3, name: 'Jo', is_you: false };
const KIM = { id: 4, name: 'Kim', is_you: false };

const LIVE: JoinInvite = {
  status: 'live',
  is_member: false,
  household: { name: 'The Bedinis', members: [ANN, JO] }
};

const MILOS: Household = { id: 11, name: "Milo's household", members: [MILO], invite: null };

const BEDINIS: Household = { id: 10, name: 'The Bedinis', members: [MILO, ANN, JO], invite: null };

const answerAccount = (account: CurrentAccount['account']) =>
  server.use(http.get('/api/account/', () => HttpResponse.json<CurrentAccount>({ account })));

const answerSignedIn = () => answerAccount({ email: 'milo@example.com', name: 'Milo', unit_system: 'metric' });

const answerLookup = (invite: JoinInvite) => server.use(http.get(LOOKUP, () => HttpResponse.json<JoinInvite>(invite)));

// Milo's household (or the one given) until a join answers The Bedinis and moves Milo there; records each join.
const answerJoin = (yours: Household = MILOS) => {
  const joins: (string | null)[] = [];
  const state = { household: yours };
  server.use(
    http.get(HOUSEHOLD, () => HttpResponse.json<Household>(state.household)),
    http.post(JOIN, ({ request }) => {
      joins.push(request.headers.get('X-CSRFToken'));
      state.household = BEDINIS;
      return HttpResponse.json<Household>(state.household);
    })
  );
  return joins;
};

const joinButton = () => screen.findByRole('button', { name: 'Join household' });

const confirmJoin = async () => {
  await userEvent.click(await joinButton());
  const asked = await screen.findByRole('alertdialog', { name: 'Join The Bedinis?' });
  await userEvent.click(within(asked).getByRole('button', { name: 'Join household' }));
};

describe('JoinPage', () => {
  beforeEach(() => {
    // biome-ignore lint/suspicious/noDocumentCookie: Django's account request sets this cookie; jsdom has no Cookie Store
    document.cookie = 'csrftoken=abc';
  });

  // Sonner keeps its toasts outside React, so one test's toast would still show in the next.
  afterEach(() => {
    toast.dismiss();
  });

  it("shows someone signed in the household's name, its members and Join", async () => {
    answerSignedIn();
    answerLookup(LIVE);
    answerJoin();
    renderRoute('/join/tok-123');

    expect(await screen.findByRole('heading', { level: 1, name: 'Join The Bedinis' })).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('Join a household · Tastebook'));
    const members = within(screen.getByRole('list', { name: 'Members' })).getAllByRole('listitem');
    expect(members.map((member) => member.textContent)).toEqual(['AAnn', 'JJo']);
    expect(await joinButton()).toBeInTheDocument();
  });

  it('shows someone signed out only that the link works, and Sign in to join', async () => {
    answerLookup({ status: 'live', is_member: false, household: null });
    renderRoute('/join/tok-123');

    expect(
      await screen.findByRole('heading', { level: 1, name: "You've been invited to a household" })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in to join' })).toHaveAttribute(
      'href',
      '/sign-in?next=%2Fjoin%2Ftok-123'
    );
    expect(screen.queryByText(/The Bedinis/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Ann/)).not.toBeInTheDocument();
  });

  it.each([
    ['expired', 'signed out', 'This invite link has expired'],
    ['expired', 'signed in', 'This invite link has expired'],
    ['cancelled', 'signed out', 'This invite link was cancelled'],
    ['cancelled', 'signed in', 'This invite link was cancelled'],
    ['unknown', 'signed out', "This invite link doesn't work"],
    ['unknown', 'signed in', "This invite link doesn't work"]
  ] as const)('says a link that is %s, %s, says so', async (status, who, title) => {
    if (who === 'signed in') {
      answerSignedIn();
    }
    server.use(
      http.get(LOOKUP, () =>
        status === 'unknown'
          ? new HttpResponse(null, { status: 404 })
          : HttpResponse.json<JoinInvite>({ status, is_member: false, household: null })
      )
    );
    renderRoute('/join/tok-123');

    expect(await screen.findByRole('heading', { level: 1, name: title })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Tastebook' })).toHaveAttribute('href', '/');
  });

  it('tells a member opening their own link that they are already in it', async () => {
    answerSignedIn();
    answerLookup({ status: 'expired', is_member: true, household: { name: 'The Bedinis', members: [MILO, ANN] } });
    renderRoute('/join/tok-123');

    expect(await screen.findByRole('heading', { level: 1, name: "You're already in The Bedinis" })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to your household' })).toHaveAttribute('href', '/household');
    expect(screen.queryByRole('button', { name: 'Join household' })).not.toBeInTheDocument();
  });

  it('asks first, naming who stays in the household you leave, and Cancel sends nothing', async () => {
    answerSignedIn();
    answerLookup(LIVE);
    const joins = answerJoin({ ...MILOS, members: [MILO, KIM] });
    renderRoute('/join/tok-123');

    await userEvent.click(await joinButton());
    const asked = await screen.findByRole('alertdialog', { name: 'Join The Bedinis?' });
    expect(asked).toHaveAccessibleDescription("You'll leave Milo's household. Kim stays in it.");
    await userEvent.click(within(asked).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(joins).toEqual([]);
  });

  it.each([
    ['others stay', [MILO, KIM, ANN], "You'll leave Milo's household. Kim and Ann stay in it."],
    ['you are its only member', [MILO], "You'll leave Milo's household. You're its only member, so it will be deleted."]
  ])('says what happens to the household you leave when %s', async (_, members, description) => {
    answerSignedIn();
    answerLookup(LIVE);
    answerJoin({ ...MILOS, members });
    renderRoute('/join/tok-123');

    await userEvent.click(await joinButton());

    expect(await screen.findByRole('alertdialog', { name: 'Join The Bedinis?' })).toHaveAccessibleDescription(
      description
    );
  });

  it('joins once confirmed and lands on the household page, saying so', async () => {
    answerSignedIn();
    answerLookup(LIVE);
    const joins = answerJoin();
    const { router } = renderRoute('/join/tok-123');

    await confirmJoin();

    expect(await screen.findByRole('heading', { level: 1, name: 'Your household' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/household');
    expect(screen.getByRole('textbox', { name: 'Household name' })).toHaveValue('The Bedinis');
    expect(await screen.findByText('You joined The Bedinis')).toBeInTheDocument();
    expect(joins).toEqual(['abc']);
  });

  it('shows Joining… on the button while the join runs', async () => {
    answerSignedIn();
    answerLookup(LIVE);
    answerJoin();
    const gate = { release: () => {} };
    const released = new Promise<void>((resolve) => {
      gate.release = resolve;
    });
    server.use(
      http.post(JOIN, async () => {
        await released;
        return HttpResponse.json<Household>(BEDINIS);
      })
    );
    renderRoute('/join/tok-123');

    await confirmJoin();

    expect(await screen.findByRole('button', { name: 'Joining…' })).toBeInTheDocument();
    gate.release();
    expect(await screen.findByRole('heading', { level: 1, name: 'Your household' })).toBeInTheDocument();
  });

  it.each([
    ['cancelled', 409],
    ['deleted', 404]
  ])('says a link %s before the join stopped working, and focuses its title', async (_, status) => {
    answerSignedIn();
    const state = { invite: LIVE };
    server.use(http.get(LOOKUP, () => HttpResponse.json<JoinInvite>(state.invite)));
    answerJoin();
    server.use(
      http.post(JOIN, () => {
        state.invite = { status: 'cancelled', is_member: false, household: null };
        return new HttpResponse(null, { status });
      })
    );
    renderRoute('/join/tok-123');

    await confirmJoin();

    expect(await screen.findByText('This invite link stopped working before you joined.')).toBeInTheDocument();
    const title = await screen.findByRole('heading', { level: 1, name: 'This invite link was cancelled' });
    await waitFor(() => expect(title).toHaveFocus());
  });

  it.each([
    ['the server fails', () => new HttpResponse(null, { status: 500 })],
    ['the network fails', () => HttpResponse.error()]
  ])("says it couldn't join when %s, and keeps the offer", async (_, answer) => {
    answerSignedIn();
    answerLookup(LIVE);
    answerJoin();
    server.use(http.post(JOIN, answer));
    renderRoute('/join/tok-123');

    await confirmJoin();

    expect(
      await screen.findByText("Couldn't join the household. Check your connection and try again.")
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Join The Bedinis' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Join household' })).toHaveFocus());
  });

  it("says the link couldn't be opened, then opens it on Try again", async () => {
    answerSignedIn();
    answerJoin();
    server.use(http.get(LOOKUP, () => new HttpResponse(null, { status: 500 })));
    renderRoute('/join/tok-123');

    expect(await screen.findByText("Couldn't open this invite link")).toBeInTheDocument();
    answerLookup(LIVE);
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Join The Bedinis' })).toBeInTheDocument();
  });

  it('shows that it is opening the link while the lookup runs', async () => {
    answerSignedIn();
    answerJoin();
    const gate = { release: () => {} };
    const released = new Promise<void>((resolve) => {
      gate.release = resolve;
    });
    server.use(
      http.get(LOOKUP, async () => {
        await released;
        return HttpResponse.json<JoinInvite>(LIVE);
      })
    );
    renderRoute('/join/tok-123');

    expect(await screen.findByText('Opening the invite link…')).toBeInTheDocument();
    gate.release();
    expect(await screen.findByRole('heading', { level: 1, name: 'Join The Bedinis' })).toBeInTheDocument();
  });

  it('sends an account with no name to give one first, then back to the link', async () => {
    answerAccount({ email: 'milo@example.com', name: '', unit_system: 'metric' });
    answerLookup(LIVE);
    const { router } = renderRoute('/join/tok-123');

    await waitFor(() => expect(router.state.location.pathname).toBe('/welcome'));
    expect(router.state.location.search).toBe('?next=%2Fjoin%2Ftok-123');
  });
});
