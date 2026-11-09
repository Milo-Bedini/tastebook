import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

const DOWNLOAD = '/api/account/download/';

type Download = components['schemas']['Download'];

const DOWNLOADED: Download = {
  format: 'tastebook',
  version: 1,
  exported_at: '2026-11-09T17:02:11Z',
  account: { name: 'Milo', email: 'sam@example.com', unit_system: 'metric', household_name: "Milo's household" },
  recipes: [],
  lists: [{ name: 'Favourites', scope: 'personal', saved_recipes: [] }]
};

// Saving a file is the browser's: jsdom has no object URLs and a link's click downloads nothing. Each file the page
// saves is kept here with the name it gave it.
const catchSavedFiles = () => {
  const saved: { filename: string; text: Promise<string> }[] = [];
  const files = new Map<string, Blob>();
  vi.spyOn(URL, 'createObjectURL').mockImplementation((file) => {
    const address = `blob:http://localhost/${files.size}`;
    files.set(address, file as Blob);
    return address;
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    saved.push({ filename: this.download, text: files.get(this.href)?.text() ?? Promise.resolve('') });
  });
  return saved;
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

  describe('downloading everything', () => {
    beforeEach(() => {
      // jsdom's URL has no object URLs for the spies to wrap.
      URL.createObjectURL ??= () => '';
      URL.revokeObjectURL ??= () => {};
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('says it is downloading, then saves the file under the name the server gave it', async () => {
      answerSignedIn();
      const saved = catchSavedFiles();
      const gate = { release: () => {} };
      const released = new Promise<void>((resolve) => {
        gate.release = resolve;
      });
      server.use(
        http.get(DOWNLOAD, async () => {
          await released;
          return HttpResponse.json<Download>(DOWNLOADED, {
            headers: { 'Content-Disposition': 'attachment; filename="tastebook-2026-11-09.json"' }
          });
        })
      );
      renderRoute('/account');

      await userEvent.click(await screen.findByRole('button', { name: 'Download everything' }));

      expect(await screen.findByRole('button', { name: 'Downloading…' })).toHaveAttribute('aria-busy', 'true');
      expect(saved).toEqual([]);

      gate.release();

      expect(await screen.findByRole('button', { name: 'Download everything' })).not.toHaveAttribute('aria-busy');
      expect(saved.map(({ filename }) => filename)).toEqual(['tastebook-2026-11-09.json']);
      expect(JSON.parse(await (saved[0]?.text ?? Promise.resolve('')))).toEqual(DOWNLOADED);
    });

    it.each([
      ['the server fails', 500],
      ['the session has ended', 403]
    ])("says the file couldn't be downloaded when %s, and saves nothing", async (_, status) => {
      answerSignedIn();
      const saved = catchSavedFiles();
      server.use(http.get(DOWNLOAD, () => new HttpResponse(null, { status })));
      renderRoute('/account');

      await userEvent.click(await screen.findByRole('button', { name: 'Download everything' }));

      expect(
        await screen.findByText("Couldn't download your file. Check your connection and try again.")
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Download everything' })).not.toHaveAttribute('aria-busy');
      expect(saved).toEqual([]);
    });
  });

  describe('deleting the account', () => {
    const DELETION = '/api/account/deletion/';
    const DELETION_CODE = '/api/account/deletion/code/';

    type AccountDeletion = components['schemas']['AccountDeletion'];

    const SAM: Account = { email: 'sam@example.com', name: 'Sam', unit_system: 'metric' };

    const WITH_JO: AccountDeletion = {
      private_recipes: 12,
      public_recipes: 3,
      others_in_household: 1,
      is_staff: false
    };

    const ON_EVERYONE =
      "Your name, email address, Favourites and personal lists will be deleted, and you'll be signed out everywhere.";
    const BACKUPS = 'Nightly backups keep a copy for up to 30 days.';

    // Signed in as Sam until the account is deleted; counts each time the session is asked, and records each code
    // tried.
    const answerDeletion = (deletion: AccountDeletion = WITH_JO) => {
      const state = { sessionChecks: 0, signedIn: true, tried: [] as unknown[], codesSent: 0 };
      server.use(
        http.get(ACCOUNT, () => {
          state.sessionChecks += 1;
          return HttpResponse.json<CurrentAccount>({ account: state.signedIn ? SAM : null });
        }),
        http.get(DELETION, () => HttpResponse.json<AccountDeletion>(deletion)),
        http.post(DELETION_CODE, () => {
          state.codesSent += 1;
          return new HttpResponse(null, { status: 204 });
        }),
        http.post(DELETION, async ({ request }) => {
          state.tried.push(await request.json());
          state.signedIn = false;
          return new HttpResponse(null, { status: 204 });
        })
      );
      return state;
    };

    const holdUntilReleased = () => {
      const gate = { release: () => {} };
      const released = new Promise<void>((resolve) => {
        gate.release = resolve;
      });
      return { gate, released };
    };

    const openDialog = async () => {
      await userEvent.click(await screen.findByRole('button', { name: 'Delete account' }));
      return screen.findByRole('alertdialog', { name: 'Delete your account?' });
    };

    const lines = (dialog: HTMLElement) =>
      within(dialog)
        .getAllByRole('paragraph')
        .map((line) => line.textContent);

    const codeField = (dialog: HTMLElement) => within(dialog).getByRole('textbox', { name: 'Code' });

    // Opens the dialog and sends a code, ending on the code step.
    const sendCode = async () => {
      const dialog = await openDialog();
      await userEvent.click(await within(dialog).findByRole('button', { name: 'Send code' }));
      await waitFor(() => expect(codeField(dialog)).toHaveFocus());
      return dialog;
    };

    const enterCode = async (dialog: HTMLElement, code: string) => {
      await userEvent.type(codeField(dialog), code);
      await userEvent.click(within(dialog).getByRole('button', { name: 'Delete account' }));
    };

    it('has a section that says what deleting does, last on the page', async () => {
      answerDeletion();
      renderRoute('/account');

      const section = await screen.findByRole('region', { name: 'Delete your account' });
      expect(section).toHaveTextContent(
        'Delete your account and everything only you can see. Public recipes you wrote stay, credited to “a former member”.'
      );
      expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual([
        'Name',
        'Units',
        'Your data',
        'Delete your account'
      ]);
    });

    it('checks what deleting removes as it opens, then says it with the real numbers', async () => {
      answerDeletion();
      const { gate, released } = holdUntilReleased();
      server.use(
        http.get(DELETION, async () => {
          await released;
          return HttpResponse.json<AccountDeletion>(WITH_JO);
        })
      );
      renderRoute('/account');

      const dialog = await openDialog();

      expect(await within(dialog).findByText('Checking what deleting removes…')).toBeInTheDocument();
      expect(within(dialog).queryByRole('button', { name: 'Send code' })).not.toBeInTheDocument();
      expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();

      gate.release();

      expect(await within(dialog).findByRole('button', { name: 'Send code' })).toBeInTheDocument();
      expect(lines(dialog)).toEqual([
        ON_EVERYONE,
        'The 12 private recipes you wrote will be deleted. Leave your household first if you want it to keep them.',
        'The 3 public recipes you wrote stay, credited to “a former member”, so links to them keep working.',
        BACKUPS
      ]);
      expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    });

    it.each<[string, Partial<AccountDeletion>, string[]]>([
      [
        'the last member, with 1 private recipe',
        { private_recipes: 1, public_recipes: 0, others_in_household: 0 },
        [ON_EVERYONE, "Your household's 1 private recipe will be deleted, as nobody else is in it.", BACKUPS]
      ],
      [
        'the last member, with 2 private and 1 public recipe',
        { private_recipes: 2, public_recipes: 1, others_in_household: 0 },
        [
          ON_EVERYONE,
          "Your household's 2 private recipes will be deleted, as nobody else is in it.",
          'The 1 public recipe in your household stays, credited to “a former member”, so links to them keep working.',
          BACKUPS
        ]
      ],
      [
        'someone with others in the household, who wrote 1 public recipe',
        { private_recipes: 0, public_recipes: 1, others_in_household: 2 },
        [
          ON_EVERYONE,
          'The 1 public recipe you wrote stays, credited to “a former member”, so links to them keep working.',
          BACKUPS
        ]
      ],
      [
        'someone who wrote nothing',
        { private_recipes: 0, public_recipes: 0, others_in_household: 0 },
        [ON_EVERYONE, BACKUPS]
      ]
    ])('leaves out a line whose number is 0, for %s', async (_, numbers, expected) => {
      answerDeletion({ ...WITH_JO, ...numbers });
      renderRoute('/account');

      const dialog = await openDialog();

      expect(await within(dialog).findByRole('button', { name: 'Send code' })).toBeInTheDocument();
      expect(lines(dialog)).toEqual(expected);
    });

    it("tells a staff account why it can't be deleted, with only a way out", async () => {
      const state = answerDeletion({ ...WITH_JO, is_staff: true });
      renderRoute('/account');

      const dialog = await openDialog();

      expect(
        await within(dialog).findByText(
          "Staff accounts can't be deleted here. Ask another staff member to take your staff access away first."
        )
      ).toBeInTheDocument();
      expect(
        within(dialog)
          .getAllByRole('button')
          .map((button) => button.textContent)
      ).toEqual(['Close']);

      await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }));

      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
      expect(screen.getByRole('button', { name: 'Delete account' })).toHaveFocus();
      expect(state.codesSent).toBe(0);
    });

    it("says Tastebook couldn't be reached when the numbers can't be checked, and tries again", async () => {
      answerDeletion();
      server.use(http.get(DELETION, () => new HttpResponse(null, { status: 500 }), { once: true }));
      renderRoute('/account');

      const dialog = await openDialog();

      const failed = await within(dialog).findByRole('alert');
      expect(failed).toHaveTextContent("Couldn't reach Tastebook");
      expect(failed).toHaveTextContent('Check your connection and try again.');
      expect(within(dialog).queryByRole('button', { name: 'Send code' })).not.toBeInTheDocument();

      await userEvent.click(within(failed).getByRole('button', { name: 'Try again' }));

      expect(await within(dialog).findByRole('button', { name: 'Send code' })).toBeInTheDocument();
      expect(lines(dialog)).toContain(BACKUPS);
    });

    it('sends a code, then deletes the account with it and lands signed out on the home page', async () => {
      const state = answerDeletion();
      const { router, queryClient } = renderRoute('/account');

      const dialog = await sendCode();

      expect(dialog).toHaveAccessibleDescription('We sent a 6-digit code to sam@example.com. It works for 10 minutes.');
      expect(state.codesSent).toBe(1);

      await enterCode(dialog, '123456');

      expect(await screen.findByText('Your account is deleted.')).toBeInTheDocument();
      expect(state.tried).toEqual([{ code: '123456' }]);
      expect(router.state.location.pathname).toBe('/');
      expect(queryClient.getQueryData(['households', 'session'])).toBeNull();
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it('asks for the 6 digits before sending anything', async () => {
      const state = answerDeletion();
      renderRoute('/account');

      const dialog = await sendCode();
      await enterCode(dialog, '12ab');

      expect(codeField(dialog)).toHaveAccessibleDescription('Enter the 6-digit code from the email, like 123456.');
      expect(codeField(dialog)).toHaveFocus();
      expect(state.tried).toEqual([]);
    });

    it.each([
      [
        400,
        "That code isn't right. Check the email and try again.",
        { code: ["That code isn't right. Check the email and try again."] }
      ],
      [
        409,
        'That code has stopped working. Send a new code.',
        { detail: 'That code has stopped working. Send a new code.' }
      ]
    ])('says what went wrong with the code on a %i, and keeps it to correct', async (status, message, body) => {
      answerDeletion();
      server.use(http.post(DELETION, () => HttpResponse.json(body, { status })));
      renderRoute('/account');

      const dialog = await sendCode();
      await enterCode(dialog, '123465');

      await waitFor(() => expect(codeField(dialog)).toHaveAccessibleDescription(message));
      expect(codeField(dialog)).toHaveValue('123465');
      expect(codeField(dialog)).toHaveFocus();
    });

    it.each([
      ['the network fails', () => HttpResponse.error()],
      ['the server fails', () => new HttpResponse(null, { status: 500 })],
      ['a 403 comes while the session still says signed in', () => new HttpResponse(null, { status: 403 })]
    ])("says the account couldn't be deleted when %s, and keeps the code", async (_, answer) => {
      const state = answerDeletion();
      server.use(http.post(DELETION, answer));
      const { queryClient } = renderRoute('/account');

      const dialog = await sendCode();
      await enterCode(dialog, '123456');

      expect(
        await screen.findByText("Couldn't delete your account. Check your connection and try again.")
      ).toBeInTheDocument();
      expect(codeField(dialog)).toHaveValue('123456');
      expect(within(dialog).getByRole('button', { name: 'Delete account' })).not.toHaveAttribute('aria-busy');
      await waitFor(() => expect(queryClient.isFetching()).toBe(0));
      expect(state.signedIn).toBe(true);
    });

    it('asks the session again on a 403, and sends someone signed out to sign in', async () => {
      const state = answerDeletion();
      server.use(
        http.post(DELETION, () => {
          state.signedIn = false;
          return new HttpResponse(null, { status: 403 });
        })
      );
      const { router } = renderRoute('/account');

      const dialog = await sendCode();
      const checksBefore = state.sessionChecks;
      await enterCode(dialog, '123456');

      expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
      expect(router.state.location.pathname + router.state.location.search).toBe('/sign-in?next=%2Faccount');
      expect(state.sessionChecks).toBeGreaterThan(checksBefore);
      expect(
        screen.getByText("Couldn't delete your account. Check your connection and try again.")
      ).toBeInTheDocument();
    });

    it('asks the session again when sending a code answers 403, and still says it was not sent', async () => {
      const state = answerDeletion();
      server.use(http.post(DELETION_CODE, () => new HttpResponse(null, { status: 403 })));
      const { queryClient } = renderRoute('/account');

      const dialog = await openDialog();
      await waitFor(() => expect(queryClient.isFetching()).toBe(0));
      const checksBefore = state.sessionChecks;
      await userEvent.click(await within(dialog).findByRole('button', { name: 'Send code' }));

      expect(
        await screen.findByText("Couldn't send the code. Check your connection and try again.")
      ).toBeInTheDocument();
      await waitFor(() => expect(state.sessionChecks).toBe(checksBefore + 1));
      expect(within(dialog).queryByRole('textbox', { name: 'Code' })).not.toBeInTheDocument();
    });

    it("says the code couldn't be sent when the network fails", async () => {
      answerDeletion();
      server.use(http.post(DELETION_CODE, () => HttpResponse.error()));
      renderRoute('/account');

      const dialog = await openDialog();
      await userEvent.click(await within(dialog).findByRole('button', { name: 'Send code' }));

      expect(
        await screen.findByText("Couldn't send the code. Check your connection and try again.")
      ).toBeInTheDocument();
      expect(within(dialog).getByRole('button', { name: 'Send code' })).not.toHaveAttribute('aria-busy');
    });

    it('says when too many codes were asked for, over the buttons before the first is sent', async () => {
      answerDeletion();
      server.use(
        http.post(DELETION_CODE, () => new HttpResponse(null, { status: 429, headers: { 'Retry-After': '420' } }))
      );
      renderRoute('/account');

      const dialog = await openDialog();
      await userEvent.click(await within(dialog).findByRole('button', { name: 'Send code' }));

      expect(await within(dialog).findByRole('alert')).toHaveTextContent(
        "You've asked for too many codes. Try again in 7 minutes."
      );
      expect(within(dialog).queryByRole('textbox', { name: 'Code' })).not.toBeInTheDocument();
    });

    it('sends a new code: the field empties, says so and takes focus, or says when too many were asked for', async () => {
      const state = answerDeletion();
      renderRoute('/account');

      const dialog = await sendCode();
      await userEvent.type(codeField(dialog), '111');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Send a new code' }));

      await waitFor(() =>
        expect(codeField(dialog)).toHaveAccessibleDescription('We sent a new code. The last one has stopped working.')
      );
      expect(codeField(dialog)).toHaveValue('');
      expect(codeField(dialog)).toHaveFocus();
      expect(state.codesSent).toBe(2);

      server.use(
        http.post(DELETION_CODE, () => new HttpResponse(null, { status: 429, headers: { 'Retry-After': '60' } }))
      );
      await userEvent.click(within(dialog).getByRole('button', { name: 'Send a new code' }));

      await waitFor(() =>
        expect(codeField(dialog)).toHaveAccessibleDescription("You've asked for too many codes. Try again in 1 minute.")
      );
      expect(codeField(dialog)).toHaveFocus();
    });

    it('shows each request on its button while it runs', async () => {
      answerDeletion();
      const sending = holdUntilReleased();
      const deleting = holdUntilReleased();
      server.use(
        http.post(DELETION_CODE, async () => {
          await sending.released;
          return new HttpResponse(null, { status: 204 });
        }),
        http.post(DELETION, async () => {
          await deleting.released;
          return HttpResponse.json(
            { code: ["That code isn't right. Check the email and try again."] },
            { status: 400 }
          );
        })
      );
      renderRoute('/account');

      const dialog = await openDialog();
      await userEvent.click(await within(dialog).findByRole('button', { name: 'Send code' }));

      expect(await within(dialog).findByRole('button', { name: 'Sending…' })).toHaveAttribute('aria-busy', 'true');

      sending.gate.release();
      await waitFor(() => expect(codeField(dialog)).toHaveFocus());
      await enterCode(dialog, '123456');

      expect(await within(dialog).findByRole('button', { name: 'Deleting…' })).toHaveAttribute('aria-busy', 'true');

      deleting.gate.release();
      expect(await within(dialog).findByRole('button', { name: 'Delete account' })).not.toHaveAttribute('aria-busy');
    });

    it('starts again at what goes and what stays when cancelled after a code was sent', async () => {
      answerDeletion();
      renderRoute('/account');

      const dialog = await sendCode();
      await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
      expect(screen.getByRole('button', { name: 'Delete account' })).toHaveFocus();

      const reopened = await openDialog();

      expect(await within(reopened).findByRole('button', { name: 'Send code' })).toBeInTheDocument();
      expect(within(reopened).queryByRole('textbox', { name: 'Code' })).not.toBeInTheDocument();
    });
  });
});
