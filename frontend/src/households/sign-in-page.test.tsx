import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { components } from '../api/schema';
import { renderRoute } from '../test/render-route';
import { server } from '../test/server';

type CurrentAccount = components['schemas']['CurrentAccount'];
type Recipe = components['schemas']['Recipe'];

const AUTH = '/api/_allauth/browser/v1/auth';

const baguette: Recipe = {
  id: 3,
  slug: 'baguette',
  visibility: 'public',
  title: 'Baguette',
  description: '',
  cuisines: [],
  courses: [],
  difficulty: 'hard',
  prep_minutes: 30,
  cook_minutes: 25,
  extra_minutes: 0,
  extra_label: '',
  total_minutes: 55,
  photo: null,
  diet_tags: [],
  servings: null,
  yield_amount: 2,
  yield_unit: 'loaves',
  equipment: [],
  one_pot: false,
  source: '',
  source_url: '',
  ingredient_lines: [],
  ingredient_groups: [],
  steps: [],
  diet_tag_conflicts: [],
  can_delete: false
};

const signedIn = (email: string) =>
  HttpResponse.json({ status: 200, data: { user: { email }, methods: [] }, meta: { is_authenticated: true } });

const pending = (flow: string) =>
  HttpResponse.json(
    { status: 401, data: { flows: [{ id: flow, is_pending: true }] }, meta: { is_authenticated: false } },
    { status: 401 }
  );

const currentAccount = (email?: string, name = 'Sam') =>
  HttpResponse.json<CurrentAccount>({ account: email === undefined ? null : { email, name, unit_system: 'metric' } });

const limited = (retryAfter?: string) =>
  HttpResponse.json(
    { status: 429 },
    { status: 429, headers: retryAfter === undefined ? {} : { 'Retry-After': retryAfter } }
  );

const rejected = (status: 400 | 409, errors: { code: string; message: string; param?: string }[] = []) =>
  HttpResponse.json({ status, ...(errors.length === 0 ? {} : { errors }) }, { status });

type SentRequest = { path: string; body: unknown };

// A stand-in for allauth: sam@example.com and staff@example.com have accounts, any other address doesn't, and
// 123456 is the code. Staff then give their authenticator app's code, 654321, or the recovery code 12345678.
const answerAllauth = () => {
  const sent: SentRequest[] = [];
  const state: { signedInAs?: string } = {};
  const record = async (path: string, request: Request) => {
    const body: unknown = await request.json();
    sent.push({ path, body });
    return body as Record<string, string>;
  };
  server.use(
    http.get('/api/account/', () => currentAccount(state.signedInAs)),
    http.post(`${AUTH}/code/request`, async ({ request }) => {
      const { email } = await record('code/request', request);
      return email === 'sam@example.com' || email === 'staff@example.com'
        ? pending('login_by_code')
        : rejected(400, [{ code: 'unknown_email', param: 'email', message: 'Unknown email address.' }]);
    }),
    http.post(`${AUTH}/signup`, async ({ request }) => {
      await record('signup', request);
      return pending('verify_email');
    }),
    http.post(`${AUTH}/code/confirm`, async ({ request }) => {
      const { code } = await record('code/confirm', request);
      if (code !== '123456') {
        return rejected(400, [{ code: 'incorrect_code', param: 'code', message: 'Incorrect code.' }]);
      }
      if (sent.some(({ body }) => (body as Record<string, string>).email === 'staff@example.com')) {
        return pending('mfa_authenticate');
      }
      state.signedInAs = 'sam@example.com';
      return signedIn('sam@example.com');
    }),
    http.post(`${AUTH}/2fa/authenticate`, async ({ request }) => {
      const { code } = await record('2fa/authenticate', request);
      if (code !== '654321' && code !== '12345678') {
        return rejected(400, [{ code: 'incorrect_code', param: 'code', message: 'Incorrect code.' }]);
      }
      state.signedInAs = 'staff@example.com';
      return signedIn('staff@example.com');
    }),
    http.post(`${AUTH}/email/verify`, async ({ request }) => {
      const { key } = await record('email/verify', request);
      state.signedInAs = 'new@example.com';
      return key === '123456' ? signedIn('new@example.com') : rejected(400);
    }),
    http.get('/api/recipes/baguette/', () => HttpResponse.json<Recipe>(baguette))
  );
  return sent;
};

const emailField = () => screen.getByRole('textbox', { name: 'Email address' });
const codeField = () => screen.getByRole('textbox', { name: 'Code' });

const sendCode = async (email: string) => {
  await userEvent.type(emailField(), email);
  await userEvent.click(screen.getByRole('button', { name: 'Send code' }));
};

const signInWith = async (code: string) => {
  await userEvent.type(await screen.findByRole('textbox', { name: 'Code' }), code);
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
};

describe('SignInPage', () => {
  it('signs an existing account in with the emailed code and goes back to the page', async () => {
    const sent = answerAllauth();
    const { router } = renderRoute('/sign-in?next=/recipes/baguette');

    await sendCode('sam@example.com');
    await signInWith('123456');

    expect(await screen.findByRole('heading', { level: 1, name: 'Baguette' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/recipes/baguette');
    expect(sent).toEqual([
      { path: 'code/request', body: { email: 'sam@example.com' } },
      { path: 'code/confirm', body: { code: '123456' } }
    ]);
  });

  it('signs a new address up with the same field and checks it with the emailed code', async () => {
    const sent = answerAllauth();
    renderRoute('/sign-in?next=/recipes/baguette');

    await sendCode('new@example.com');

    const heading = await screen.findByRole('heading', { level: 1, name: 'Check your email' });
    expect(heading).toHaveFocus();
    expect(heading.nextElementSibling).toHaveTextContent(
      'We sent a 6-digit code to new@example.com. It works for 10 minutes.'
    );

    await signInWith('123456');

    expect(await screen.findByRole('heading', { level: 1, name: 'Baguette' })).toBeInTheDocument();
    expect(sent).toEqual([
      { path: 'code/request', body: { email: 'new@example.com' } },
      { path: 'signup', body: { email: 'new@example.com' } },
      { path: 'email/verify', body: { key: '123456' } }
    ]);
  });

  it('says how to fix an address that is not one, and sends nothing', async () => {
    const sent = answerAllauth();
    renderRoute('/sign-in');

    await sendCode('sam@example');

    expect(emailField()).toHaveAccessibleDescription('Enter your email address, like sam@example.com.');
    expect(emailField()).toHaveAttribute('aria-invalid', 'true');
    expect(emailField()).toHaveFocus();
    expect(sent).toEqual([]);
  });

  it("shows the server's message for an address it refuses", async () => {
    answerAllauth();
    const refused = 'Addresses at tastebook.test are only for testing. Use your own email address.';
    server.use(
      http.post(`${AUTH}/signup`, () => rejected(400, [{ code: 'test_account', param: 'email', message: refused }]))
    );
    renderRoute('/sign-in');

    await sendCode('cook@tastebook.test');

    expect(await screen.findByText(refused)).toBeInTheDocument();
    expect(emailField()).toHaveAccessibleDescription(refused);
    expect(emailField()).toHaveValue('cook@tastebook.test');
  });

  it.each([
    ['420', "You've asked for too many codes. Try again in 7 minutes."],
    ['60', "You've asked for too many codes. Try again in 1 minute."],
    ['61', "You've asked for too many codes. Try again in 2 minutes."],
    [undefined, "You've asked for too many codes. Try again in a few minutes."]
  ])('says when to try again when asked for too many codes (Retry-After %s)', async (retryAfter, message) => {
    answerAllauth();
    server.use(http.post(`${AUTH}/code/request`, () => limited(retryAfter)));
    renderRoute('/sign-in');

    await sendCode('sam@example.com');

    await waitFor(() => expect(emailField()).toHaveAccessibleDescription(message));
    expect(emailField()).toHaveFocus();
    expect(screen.getByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
  });

  it('says when to try again when a new address is refused a sign-up for too many requests', async () => {
    answerAllauth();
    server.use(http.post(`${AUTH}/signup`, () => limited('30')));
    renderRoute('/sign-in');

    await sendCode('new@example.com');

    await waitFor(() =>
      expect(emailField()).toHaveAccessibleDescription("You've asked for too many codes. Try again in 1 minute.")
    );
  });

  it('says how to fix a code that is not 6 digits, and sends nothing', async () => {
    const sent = answerAllauth();
    renderRoute('/sign-in');
    await sendCode('sam@example.com');

    await signInWith('12ab');

    expect(codeField()).toHaveAccessibleDescription('Enter the 6-digit code from the email, like 123456.');
    expect(sent.map(({ path }) => path)).toEqual(['code/request']);
  });

  it.each([
    [
      'a wrong code',
      () => rejected(400, [{ code: 'incorrect_code', param: 'code', message: 'Incorrect code.' }]),
      "That code isn't right. Check the email and try again."
    ],
    [
      'a code that has stopped working',
      () => rejected(409),
      'That code has stopped working. Use a different email or send a new code from step 1.'
    ]
  ])('says so for %s and keeps it in the field', async (_, answer, message) => {
    answerAllauth();
    server.use(http.post(`${AUTH}/code/confirm`, answer));
    renderRoute('/sign-in');
    await sendCode('sam@example.com');

    await signInWith('654321');

    await waitFor(() => expect(codeField()).toHaveAccessibleDescription(message));
    expect(codeField()).toHaveValue('654321');
    expect(codeField()).toHaveFocus();
  });

  it("says Tastebook couldn't be reached and keeps the address", async () => {
    answerAllauth();
    server.use(http.post(`${AUTH}/code/request`, () => HttpResponse.error()));
    renderRoute('/sign-in');

    await sendCode('sam@example.com');

    const banner = await screen.findByRole('alert');
    expect(banner).toHaveTextContent("Couldn't reach Tastebook");
    expect(banner).toHaveTextContent('Check your connection and try again.');
    expect(emailField()).toHaveValue('sam@example.com');
  });

  it('goes back to the address, kept and focused, from Use a different email', async () => {
    answerAllauth();
    renderRoute('/sign-in');
    await sendCode('sam@example.com');

    await userEvent.click(await screen.findByRole('button', { name: 'Use a different email' }));

    expect(screen.getByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
    expect(emailField()).toHaveValue('sam@example.com');
    expect(emailField()).toHaveFocus();
  });

  it.each([
    ['/recipes/baguette', 'Baguette', '/recipes/baguette'],
    ['//evil.example', 'Tastebook', '/'],
    ['/\\evil.example', 'Tastebook', '/'],
    ['https://evil.example', 'Tastebook', '/'],
    [null, 'Tastebook', '/']
  ])('after signing in with next=%s, lands on %s', async (next, heading, landing) => {
    answerAllauth();
    const { router } = renderRoute(next === null ? '/sign-in' : `/sign-in?next=${encodeURIComponent(next)}`);

    await sendCode('sam@example.com');
    await signInWith('123456');

    expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(landing);
  });

  it('sends a new account on to the name page, keeping where it was going', async () => {
    const sent = answerAllauth();
    server.use(
      http.get('/api/account/', () =>
        sent.length > 2 ? currentAccount('new@example.com', '') : currentAccount(undefined)
      )
    );
    const { router } = renderRoute('/sign-in?next=/recipes/baguette');

    await sendCode('new@example.com');
    await signInWith('123456');

    expect(await screen.findByRole('heading', { level: 1, name: 'What’s your name?' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/welcome');
    expect(router.state.location.search).toBe('?next=%2Frecipes%2Fbaguette');
  });

  it('goes straight to next when already signed in', async () => {
    answerAllauth();
    server.use(http.get('/api/account/', () => currentAccount('sam@example.com')));
    const { router } = renderRoute('/sign-in?next=/recipes');

    expect(await screen.findByRole('heading', { level: 1, name: 'What shall we cook tonight?' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/recipes');
  });
});

const twoFactorHeading = () => screen.findByRole('heading', { level: 1, name: 'Enter your two-factor code' });

const signInAsStaff = async () => {
  await sendCode('staff@example.com');
  await signInWith('123456');
  return twoFactorHeading();
};

describe('SignInPage with two factors', () => {
  it('asks staff for their authenticator code after the emailed one', async () => {
    answerAllauth();
    renderRoute('/sign-in?next=/recipes/baguette');

    expect(await signInAsStaff()).toHaveFocus();
  });

  it.each([
    ['the app’s code', '654321'],
    ['a recovery code', '12345678']
  ])('signs staff in with %s and goes back to the page', async (_, code) => {
    const sent = answerAllauth();
    const { router } = renderRoute('/sign-in?next=/recipes/baguette');
    await signInAsStaff();

    await signInWith(code);

    expect(await screen.findByRole('heading', { level: 1, name: 'Baguette' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/recipes/baguette');
    expect(sent.at(-1)).toEqual({ path: '2fa/authenticate', body: { code } });
  });

  it('says how to fix a code that is neither 6 nor 8 digits, and sends nothing', async () => {
    const sent = answerAllauth();
    renderRoute('/sign-in');
    await signInAsStaff();

    await signInWith('12345');

    expect(codeField()).toHaveAccessibleDescription(
      'Enter the 6-digit code from your authenticator app, like 123456, or an 8-digit recovery code.'
    );
    expect(sent.map(({ path }) => path)).not.toContain('2fa/authenticate');
  });

  it.each([
    [
      'a wrong code',
      () => rejected(400, [{ code: 'incorrect_code', param: 'code', message: 'Incorrect code.' }]),
      "That code isn't right. Check the app and try again."
    ],
    [
      'too many tries',
      () => rejected(400, [{ code: 'too_many_login_attempts', message: 'Too many failed login attempts.' }]),
      "You've tried too many codes. Wait a few minutes and try again."
    ],
    ['a sign-in that has timed out', () => rejected(409), 'That sign-in has timed out. Start again from step 1.']
  ])('says so for %s and keeps the field focused', async (_, answer, message) => {
    answerAllauth();
    server.use(http.post(`${AUTH}/2fa/authenticate`, answer));
    renderRoute('/sign-in');
    await signInAsStaff();

    await signInWith('111111');

    await waitFor(() => expect(codeField()).toHaveAccessibleDescription(message));
    expect(codeField()).toHaveFocus();
  });

  it("says Tastebook couldn't be reached when the two-factor code can't be sent", async () => {
    answerAllauth();
    server.use(http.post(`${AUTH}/2fa/authenticate`, () => HttpResponse.error()));
    renderRoute('/sign-in');
    await signInAsStaff();

    await signInWith('654321');

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't reach Tastebook");
  });

  it('goes back to the email step, focused, from Start again', async () => {
    answerAllauth();
    renderRoute('/sign-in');
    await signInAsStaff();

    await userEvent.click(screen.getByRole('button', { name: 'Start again' }));

    expect(screen.getByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
    expect(emailField()).toHaveFocus();
  });

  it('links to the privacy page at every step', async () => {
    answerAllauth();
    renderRoute('/sign-in?next=/recipes/baguette');
    const privacyLink = () => screen.getByRole('link', { name: 'How Tastebook uses your data' });

    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
    expect(privacyLink()).toHaveAttribute('href', '/privacy');

    await sendCode('staff@example.com');
    expect(await screen.findByRole('heading', { level: 1, name: 'Check your email' })).toBeInTheDocument();
    expect(privacyLink()).toHaveAttribute('href', '/privacy');

    await signInWith('123456');
    expect(await twoFactorHeading()).toBeInTheDocument();
    expect(privacyLink()).toHaveAttribute('href', '/privacy');
  });

  it('asks staff back from Google for their authenticator code', async () => {
    answerAllauth();
    server.use(http.get(`${AUTH}/session`, () => pending('mfa_authenticate')));
    renderRoute('/sign-in?next=%2Frecipes&via=google');

    expect(await screen.findByText('Signing you in…')).toBeInTheDocument();
    expect(await twoFactorHeading()).toBeInTheDocument();
  });

  it.each([
    ['/sign-in?next=%2Frecipes', 0],
    ['/sign-in?next=%2Frecipes&via=google', 1]
  ])('on %s, asks allauth for a pending second factor %i times', async (address, times) => {
    answerAllauth();
    server.use(http.get(`${AUTH}/session`, () => pending('login_by_code')));
    const asked: string[] = [];
    server.events.on('response:mocked', ({ request }) => asked.push(new URL(request.url).pathname));
    const { queryClient } = renderRoute(address);

    await waitFor(() => expect(asked).toContain('/api/account/'));
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));
    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
    expect(asked.filter((path) => path === `${AUTH}/session`)).toHaveLength(times);
    server.events.removeAllListeners();
  });

  it('shows the email step when asking allauth back from Google fails', async () => {
    answerAllauth();
    server.use(http.get(`${AUTH}/session`, () => new HttpResponse(null, { status: 500 })));
    renderRoute('/sign-in?next=%2Frecipes&via=google');

    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
  });
});

const offerGoogle = () =>
  server.use(
    http.get('/api/_allauth/browser/v1/config', () =>
      HttpResponse.json({
        status: 200,
        data: {
          socialaccount: {
            providers: [{ id: 'google', name: 'Google', client_id: 'tastebook', flows: ['provider_redirect'] }]
          }
        }
      })
    )
  );

const googleButton = () => screen.queryByRole('button', { name: 'Continue with Google' });

// jsdom can't navigate, so the form posted to allauth is caught as it's submitted.
const catchFormPosts = () => {
  const submit = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => undefined);
  return () =>
    submit.mock.contexts
      .filter((form) => form instanceof HTMLFormElement)
      .map((form) => ({
        method: form.method,
        path: new URL(form.action).pathname,
        fields: Object.fromEntries(new FormData(form))
      }));
};

describe('SignInPage with Google', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    // biome-ignore lint/suspicious/noDocumentCookie: jsdom has no Cookie Store; the next test may need no cookie
    document.cookie = 'csrftoken=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  });

  it('posts to allauth to go to Google, asking to come back to the sign-in page and on to next', async () => {
    answerAllauth();
    offerGoogle();
    // biome-ignore lint/suspicious/noDocumentCookie: Django's account request sets this cookie; jsdom has no Cookie Store
    document.cookie = 'csrftoken=from-the-cookie';
    const formPosts = catchFormPosts();
    renderRoute('/sign-in?next=/recipes/baguette');

    await userEvent.click(await screen.findByRole('button', { name: 'Continue with Google' }));

    await waitFor(() =>
      expect(formPosts()).toEqual([
        {
          method: 'post',
          path: '/api/_allauth/browser/v1/auth/provider/redirect',
          fields: {
            provider: 'google',
            process: 'login',
            callback_url: '/sign-in?next=%2Frecipes%2Fbaguette&via=google',
            csrfmiddlewaretoken: 'from-the-cookie'
          }
        }
      ])
    );
  });

  it.each([
    ['offers Google when the server has it set up', offerGoogle, true],
    ['offers no Google when the server has no Google client', () => undefined, false],
    [
      'offers no Google when asking the server fails',
      () => server.use(http.get('/api/_allauth/browser/v1/config', () => new HttpResponse(null, { status: 500 }))),
      false
    ]
  ])('%s, and the email code either way', async (_, answer, isOffered) => {
    answerAllauth();
    answer();
    const asked: string[] = [];
    server.events.on('response:mocked', ({ request }) => asked.push(new URL(request.url).pathname));
    const { queryClient } = renderRoute('/sign-in');

    await waitFor(() => expect(asked).toContain('/api/_allauth/browser/v1/config'));
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));
    // TanStack Query tells components a query settled on a zero timeout; let that render land before looking.
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(googleButton() !== null).toBe(isOffered);
    expect(screen.getByRole('button', { name: 'Send code' })).toBeInTheDocument();
    server.events.removeAllListeners();
  });

  it('says signing in with Google did not work when Google sends someone back with an error, until the next press', async () => {
    answerAllauth();
    const { router } = renderRoute('/sign-in?next=%2Frecipes%2Fbaguette&error=cancelled&error_process=login');

    const banner = await screen.findByRole('alert');
    expect(banner).toHaveTextContent("Couldn't sign in with Google");
    expect(banner).toHaveTextContent('Try again, or use an email code instead.');

    await sendCode('sam@example.com');

    expect(await screen.findByRole('heading', { level: 1, name: 'Check your email' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(router.state.location.search).toBe('?next=%2Frecipes%2Fbaguette');
  });

  it("says Tastebook couldn't be reached when going to Google fails before leaving", async () => {
    answerAllauth();
    offerGoogle();
    const formPosts = catchFormPosts();
    renderRoute('/sign-in');
    const button = await screen.findByRole('button', { name: 'Continue with Google' });
    server.use(http.get('/api/account/', () => HttpResponse.error()));

    await userEvent.click(button);

    const banner = await screen.findByRole('alert');
    expect(banner).toHaveTextContent("Couldn't reach Tastebook");
    expect(formPosts()).toEqual([]);
  });
});
