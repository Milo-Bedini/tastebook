import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { components } from '../api/schema';
import { toast } from '../dino';
import { renderRoute } from '../test/render-route';
import { server } from '../test/server';

type Account = components['schemas']['Account'];
type CurrentAccount = components['schemas']['CurrentAccount'];
type PatchedAccountChanges = components['schemas']['PatchedAccountChanges'];

const ACCOUNT = '/api/account/';

// Signed in as Milo, until a PATCH changes the account; records each PATCH body in the order it arrives.
const answerSignedIn = (account: Partial<Account> = {}) => {
  const saves: PatchedAccountChanges[] = [];
  const state: { account: Account } = {
    account: { email: 'sam@example.com', name: 'Milo', unit_system: 'metric', ...account }
  };
  server.use(
    http.get(ACCOUNT, () => HttpResponse.json<CurrentAccount>({ account: state.account })),
    http.patch(ACCOUNT, async ({ request }) => {
      const body = (await request.json()) as PatchedAccountChanges;
      saves.push(body);
      state.account = { ...state.account, ...body };
      return HttpResponse.json<Account>(state.account);
    })
  );
  return saves;
};

const nameField = () => screen.getByRole('textbox', { name: 'Your name' });

const unitsGroup = () => screen.getByRole('group', { name: 'Units' });

const saveName = async (name: string) => {
  await userEvent.clear(await screen.findByRole('textbox', { name: 'Your name' }));
  if (name !== '') {
    await userEvent.type(nameField(), name);
  }
  await userEvent.click(screen.getByRole('button', { name: 'Save name' }));
};

const chooseUnits = async (label: string) => {
  await screen.findByRole('heading', { level: 1, name: 'Your account' });
  await userEvent.click(within(unitsGroup()).getByRole('radio', { name: label }));
};

describe('AccountPage', () => {
  beforeEach(() => {
    // biome-ignore lint/suspicious/noDocumentCookie: Django's account request sets this cookie; jsdom has no Cookie Store
    document.cookie = 'csrftoken=abc';
  });

  // Sonner keeps its toasts outside React, so one test's toast would still show in the next.
  afterEach(() => {
    toast.dismiss();
  });

  it('shows that it is checking the account, then the name and units', async () => {
    const gate = { release: () => {} };
    const released = new Promise<void>((resolve) => {
      gate.release = resolve;
    });
    server.use(
      http.get(ACCOUNT, async () => {
        await released;
        return HttpResponse.json<CurrentAccount>({
          account: { email: 'sam@example.com', name: 'Milo', unit_system: 'us' }
        });
      })
    );
    renderRoute('/account');

    expect(await screen.findByText('Checking your account…')).toBeInTheDocument();

    gate.release();

    expect(await screen.findByRole('heading', { level: 1, name: 'Your account' })).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('Your account · Tastebook'));
    expect(nameField()).toHaveValue('Milo');
    expect(nameField()).toHaveAccessibleDescription('It shows on recipes you write, like “by Milo”.');
    expect(within(unitsGroup()).getByRole('radio', { name: 'US customary' })).toBeChecked();
    expect(within(unitsGroup()).getByRole('radio', { name: 'Metric' })).not.toBeChecked();
  });

  it('sends a visitor to sign in, and back here after', async () => {
    const { router } = renderRoute('/account');

    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
    expect(router.state.location.pathname + router.state.location.search).toBe('/sign-in?next=%2Faccount');
  });

  it("says Tastebook couldn't be reached when the account can't be checked, and tries again", async () => {
    server.use(http.get(ACCOUNT, () => new HttpResponse(null, { status: 500 })));
    renderRoute('/account');

    const failed = await screen.findByRole('alert');
    expect(failed).toHaveTextContent("Couldn't reach Tastebook");
    expect(failed).toHaveTextContent('Check your connection and try again.');

    answerSignedIn();
    await userEvent.click(within(failed).getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Your account' })).toBeInTheDocument();
  });

  it('saves a new name trimmed, says so, and renames the top bar', async () => {
    const saves = answerSignedIn();
    renderRoute('/account');

    await saveName('  Milo Bedini ');

    expect(await screen.findByText('Name saved')).toBeInTheDocument();
    expect(saves).toEqual([{ name: 'Milo Bedini' }]);
    expect(nameField()).toHaveValue('Milo Bedini');
    expect(
      within(screen.getByRole('banner')).getByRole('button', { name: 'Account for Milo Bedini' })
    ).toBeInTheDocument();
  });

  it.each([
    ['empty', ''],
    ['only spaces', '   ']
  ])('says how to fix a name that is %s, and sends nothing', async (_, name) => {
    const saves = answerSignedIn();
    renderRoute('/account');

    await saveName(name);

    expect(nameField()).toHaveAccessibleDescription('Enter your name, like Milo.');
    expect(nameField()).toHaveFocus();
    expect(saves).toEqual([]);
  });

  it("shows the server's message for a name it refuses", async () => {
    answerSignedIn();
    const refused = 'Ensure this field has no more than 50 characters.';
    server.use(http.patch(ACCOUNT, () => HttpResponse.json({ name: [refused] }, { status: 400 })));
    renderRoute('/account');

    await saveName('Sam Jones');

    await waitFor(() => expect(nameField()).toHaveAccessibleDescription(refused));
    expect(nameField()).toHaveFocus();
  });

  it.each([
    ['the server fails', () => new HttpResponse(null, { status: 500 })],
    ['the session has ended', () => new HttpResponse(null, { status: 403 })],
    ['the network fails', () => HttpResponse.error()]
  ])("says the name couldn't be saved and keeps it when %s", async (_, answer) => {
    answerSignedIn();
    server.use(http.patch(ACCOUNT, answer));
    renderRoute('/account');

    await saveName('Sam Jones');

    expect(
      await screen.findByText("Couldn't save your name. Check your connection and try again.")
    ).toBeInTheDocument();
    expect(nameField()).toHaveValue('Sam Jones');
    expect(within(screen.getByRole('banner')).getByRole('button', { name: 'Account for Milo' })).toBeInTheDocument();
  });

  it('saves US customary the moment it is chosen', async () => {
    const saves = answerSignedIn();
    renderRoute('/account');

    await chooseUnits('US customary');

    expect(await screen.findByText('Units saved')).toBeInTheDocument();
    expect(saves).toEqual([{ unit_system: 'us' }]);
    expect(within(unitsGroup()).getByRole('radio', { name: 'US customary' })).toBeChecked();
  });

  it.each([
    ['the server fails', 500],
    ['the session has ended', 403]
  ])("puts the saved units back when they can't be saved because %s", async (_, status) => {
    answerSignedIn();
    server.use(http.patch(ACCOUNT, () => new HttpResponse(null, { status })));
    renderRoute('/account');

    await chooseUnits('US customary');

    expect(
      await screen.findByText("Couldn't save your units. Check your connection and try again.")
    ).toBeInTheDocument();
    expect(within(unitsGroup()).getByRole('radio', { name: 'Metric' })).toBeChecked();
    expect(within(unitsGroup()).getByRole('radio', { name: 'US customary' })).not.toBeChecked();
  });

  it('keeps the last of two quick choices, saved in the order they were made', async () => {
    const saves = answerSignedIn();
    const gate = { release: () => {} };
    const released = new Promise<void>((resolve) => {
      gate.release = resolve;
    });
    server.use(
      http.patch(ACCOUNT, async ({ request }) => {
        const body = (await request.json()) as PatchedAccountChanges;
        saves.push(body);
        await released;
        return HttpResponse.json<Account>({
          email: 'sam@example.com',
          name: 'Milo',
          unit_system: body.unit_system ?? 'metric'
        });
      })
    );
    const { queryClient } = renderRoute('/account');

    await chooseUnits('US customary');
    expect(within(unitsGroup()).getByRole('radio', { name: 'US customary' })).toBeChecked();
    await chooseUnits('Metric');
    expect(within(unitsGroup()).getByRole('radio', { name: 'Metric' })).toBeChecked();

    gate.release();

    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
    expect(saves).toEqual([{ unit_system: 'us' }, { unit_system: 'metric' }]);
    expect(within(unitsGroup()).getByRole('radio', { name: 'Metric' })).toBeChecked();
  });
});
