import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import type { components } from '../api/schema';
import { renderRoute } from '../test/render-route';
import { server } from '../test/server';

type Account = components['schemas']['Account'];
type CurrentAccount = components['schemas']['CurrentAccount'];

const ACCOUNT = '/api/account/';

type SentSave = { body: unknown; csrfToken: string | null };

// Signed in as sam@example.com with no name, until a PATCH saves one.
const answerNameless = () => {
  const saves: SentSave[] = [];
  const state: { account: Account } = { account: { email: 'sam@example.com', name: '', unit_system: 'metric' } };
  server.use(
    http.get(ACCOUNT, () => HttpResponse.json<CurrentAccount>({ account: state.account })),
    http.patch(ACCOUNT, async ({ request }) => {
      const body = (await request.json()) as { name: string };
      saves.push({ body, csrfToken: request.headers.get('X-CSRFToken') });
      state.account = { ...state.account, name: body.name };
      return HttpResponse.json<Account>(state.account);
    })
  );
  return saves;
};

const nameField = () => screen.getByRole('textbox', { name: 'Your name' });

const saveName = async (name: string) => {
  await userEvent.type(await screen.findByRole('textbox', { name: 'Your name' }), name);
  await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
};

describe('WelcomePage', () => {
  beforeEach(() => {
    // biome-ignore lint/suspicious/noDocumentCookie: Django's account request sets this cookie; jsdom has no Cookie Store
    document.cookie = 'csrftoken=abc';
  });

  it('is where a nameless account opening any page is sent', async () => {
    answerNameless();
    const { router } = renderRoute('/recipes/apple-tart');

    expect(await screen.findByRole('heading', { level: 1, name: 'What’s your name?' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/welcome');
    expect(router.state.location.search).toBe('?next=%2Frecipes%2Fapple-tart');
  });

  it('saves the name and goes on to the page, with the name in the top bar', async () => {
    const saves = answerNameless();
    const { router } = renderRoute('/recipes/apple-tart');

    await saveName('Milo');

    expect(await screen.findByRole('heading', { level: 1, name: 'Apple tart' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/recipes/apple-tart');
    expect(saves).toEqual([{ body: { name: 'Milo' }, csrfToken: 'abc' }]);
    expect(within(screen.getByRole('banner')).getByRole('button', { name: 'Account for Milo' })).toBeInTheDocument();
  });

  it.each([
    ['empty', ''],
    ['only spaces', '   ']
  ])('says how to fix a name that is %s, and sends nothing', async (_, name) => {
    const saves = answerNameless();
    renderRoute('/welcome');
    await screen.findByRole('textbox', { name: 'Your name' });

    if (name !== '') {
      await userEvent.type(nameField(), name);
    }
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(nameField()).toHaveAccessibleDescription('Enter your name, like Milo.');
    expect(nameField()).toHaveFocus();
    expect(saves).toEqual([]);
  });

  it("shows the server's message for a name it refuses", async () => {
    answerNameless();
    const refused = 'Ensure this field has no more than 50 characters.';
    server.use(http.patch(ACCOUNT, () => HttpResponse.json({ name: [refused] }, { status: 400 })));
    renderRoute('/welcome');

    await saveName('Milo');

    await waitFor(() => expect(nameField()).toHaveAccessibleDescription(refused));
    expect(nameField()).toHaveValue('Milo');
    expect(nameField()).toHaveFocus();
  });

  it.each([
    ['the server fails', () => new HttpResponse(null, { status: 500 })],
    ['the session has ended', () => new HttpResponse(null, { status: 403 })],
    ['the network fails', () => HttpResponse.error()]
  ])("says Tastebook couldn't be reached and keeps the name when %s", async (_, answer) => {
    answerNameless();
    server.use(http.patch(ACCOUNT, answer));
    renderRoute('/welcome');

    await saveName('Milo');

    const banner = await screen.findByRole('alert');
    expect(banner).toHaveTextContent("Couldn't reach Tastebook");
    expect(banner).toHaveTextContent('Check your connection and try again.');
    expect(nameField()).toHaveValue('Milo');
  });

  it.each([
    ['a named account', { email: 'sam@example.com', name: 'Sam', unit_system: 'metric' as const }],
    ['a visitor who is signed out', null]
  ])('lets %s open any page', async (_, account) => {
    server.use(http.get(ACCOUNT, () => HttpResponse.json<CurrentAccount>({ account })));
    const { router } = renderRoute('/recipes/apple-tart');

    expect(await screen.findByRole('heading', { level: 1, name: 'Apple tart' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/recipes/apple-tart');
  });

  it.each([
    ['a named account', { email: 'sam@example.com', name: 'Sam', unit_system: 'metric' as const }],
    ['a visitor who is signed out', null]
  ])('sends %s on from the name page to next', async (_, account) => {
    server.use(http.get(ACCOUNT, () => HttpResponse.json<CurrentAccount>({ account })));
    const { router } = renderRoute('/welcome?next=%2Frecipes');

    await waitFor(() => expect(router.state.location.pathname).toBe('/recipes'));
    expect(await screen.findByRole('heading', { level: 1, name: 'What shall we cook tonight?' })).toBeInTheDocument();
  });

  it('asks again when the account could not be checked, then shows the form', async () => {
    server.use(http.get(ACCOUNT, () => new HttpResponse(null, { status: 500 })));
    renderRoute('/welcome');

    const failed = await screen.findByRole('alert');
    expect(failed).toHaveTextContent("Couldn't reach Tastebook");

    answerNameless();
    await userEvent.click(within(failed).getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'What’s your name?' })).toBeInTheDocument();
  });
});
