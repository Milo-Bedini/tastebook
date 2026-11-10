import { type FormEvent, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Navigate } from 'react-router';

import type { components } from '../api/schema';
import {
  Button,
  ConfirmDialog,
  ErrorWithRetry,
  Field,
  Input,
  Loading,
  Page,
  SegmentedControl,
  Squiggle,
  toast
} from '../dino';
import type { Account } from './auth-api';
import { type AccountDeletion, useAccountDeletion, useDeleteAccount, useSendDeletionCode } from './deletion-api';
import { type DownloadedFile, useDownloadEverything } from './download-api';
import { NAME_MAX_LENGTH, NOT_A_NAME, useSaveName } from './name-api';
import { useSession } from './session-api';
import { useChooseUnitSystem } from './units-api';

type UnitSystem = components['schemas']['UnitSystem'];

const unitSystems: { value: UnitSystem; label: string }[] = [
  { value: 'metric', label: 'Metric' },
  { value: 'us', label: 'US customary' }
];

const NameForm = ({ name: savedName }: { name: string }) => {
  const saveName = useSaveName();
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(savedName);
  const [error, setError] = useState<string>();

  const refuse = (message: string) => {
    setError(message);
    nameRef.current?.focus();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(undefined);
    const trimmed = name.trim();
    if (trimmed === '') {
      refuse(NOT_A_NAME);
      return;
    }
    try {
      const result = await saveName.mutateAsync(trimmed);
      if (result.kind === 'refused') {
        refuse(result.message);
        return;
      }
      setName(result.account.name);
      toast.success('Name saved');
    } catch {
      toast.error("Couldn't save your name. Check your connection and try again.");
    }
  };

  return (
    <section aria-labelledby="account-name" className="flex flex-col gap-4">
      <h2 id="account-name">Name</h2>
      <form noValidate onSubmit={submit} className="flex flex-col gap-5">
        <Field label="Your name" help="It shows on recipes you write, like “by Milo”." error={error}>
          {(control) => (
            <Input
              {...control}
              ref={nameRef}
              autoComplete="name"
              maxLength={NAME_MAX_LENGTH}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </Field>
        <div className="flex flex-wrap items-start gap-2">
          <Button type="submit" loading={saveName.isPending} loadingLabel="Saving…">
            Save name
          </Button>
        </div>
      </form>
    </section>
  );
};

const UnitsChoice = ({ unitSystem }: { unitSystem: UnitSystem }) => {
  const chooseUnitSystem = useChooseUnitSystem();
  // The latest choice shows while it saves; a failed save leaves the saved one.
  const shown = chooseUnitSystem.isPending ? chooseUnitSystem.variables : unitSystem;
  const choose = (chosen: UnitSystem) =>
    chooseUnitSystem.mutate(chosen, {
      onSuccess: () => toast.success('Units saved'),
      onError: () => toast.error("Couldn't save your units. Check your connection and try again.")
    });
  return (
    <section aria-labelledby="account-units" className="flex flex-col gap-4">
      <h2 id="account-units">Units</h2>
      <p>Recipes open in these units. You can still switch on any recipe.</p>
      <div>
        <SegmentedControl label="Units" options={unitSystems} value={shown} onValueChange={choose} />
      </div>
    </section>
  );
};

const saveFile = ({ blob, filename }: DownloadedFile) => {
  const address = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = address;
  link.download = filename;
  link.click();
  // Safari starts the download after the click returns, so the address is let go a moment later.
  setTimeout(() => URL.revokeObjectURL(address));
};

const DownloadEverything = () => {
  const download = useDownloadEverything();
  const start = () =>
    download.mutate(undefined, {
      onSuccess: saveFile,
      onError: () => toast.error("Couldn't download your file. Check your connection and try again.")
    });
  return (
    <section aria-labelledby="account-download" className="flex flex-col gap-4">
      <h2 id="account-download">Your data</h2>
      <p>
        Download everything you have in Tastebook as one file: your account details, the recipes you wrote, your
        household's private recipes and your lists.
      </p>
      <div>
        <Button variant="secondary" onClick={start} loading={download.isPending} loadingLabel="Downloading…">
          Download everything
        </Button>
      </div>
    </section>
  );
};

const CODE_PATTERN = /^\d{6}$/;

// Sign-in's words for a code, where they fit.
const NOT_A_CODE = 'Enter the 6-digit code from the email, like 123456.';
const WRONG_CODE = "That code isn't right. Check the email and try again.";
const STOPPED = 'That code has stopped working. Send a new code.';
const NEW_CODE_SENT = 'We sent a new code. The last one has stopped working.';
const STAFF_REFUSED =
  "Staff accounts can't be deleted here. Ask another staff member to take your staff access away first.";

const minutes = (seconds: number): string => {
  const count = Math.ceil(seconds / 60);
  return count === 1 ? '1 minute' : `${count} minutes`;
};

const tooManyCodes = (retryAfterSeconds: number | undefined): string =>
  `You've asked for too many codes. Try again in ${retryAfterSeconds === undefined ? 'a few minutes' : minutes(retryAfterSeconds)}.`;

const recipes = (count: number, kind: 'private' | 'public'): string =>
  `${count} ${kind} ${count === 1 ? 'recipe' : 'recipes'}`;

// One line each, a line left out when its number is 0.
const whatGoes = ({ private_recipes, public_recipes, others_in_household }: AccountDeletion): string[] => {
  const isLast = others_in_household === 0;
  const privateLine = isLast
    ? `Your household's ${recipes(private_recipes, 'private')} will be deleted, as nobody else is in it.`
    : `The ${recipes(private_recipes, 'private')} you wrote will be deleted. Leave your household first if you want it to keep them.`;
  const stay = public_recipes === 1 ? 'stays' : 'stay';
  const publicLine = isLast
    ? `The ${recipes(public_recipes, 'public')} in your household ${stay}, credited to “a former member”, so links to them keep working.`
    : `The ${recipes(public_recipes, 'public')} you wrote ${stay}, credited to “a former member”, so links to them keep working.`;
  return [
    "Your name, email address, Favourites and personal lists will be deleted, and you'll be signed out everywhere.",
    ...(private_recipes > 0 ? [privateLine] : []),
    ...(public_recipes > 0 ? [publicLine] : []),
    'Nightly backups keep a copy for up to 30 days.'
  ];
};

type CodeStep = { code: string; error?: string; help?: string };

const DeleteAccount = ({ email }: { email: string }) => {
  const [open, setOpen] = useState(false);
  // Undefined until a code is sent; cancelling starts again at what goes and what stays.
  const [codeStep, setCodeStep] = useState<CodeStep>();
  const [sendError, setSendError] = useState<string>();
  const codeRef = useRef<HTMLInputElement>(null);
  const { deletion, errorUpdatedAt, refetch, forget } = useAccountDeletion(open);
  const sendCode = useSendDeletionCode();
  const deleteAccount = useDeleteAccount();

  const changeOpen = (isOpen: boolean) => {
    // Forgotten as it opens rather than as it closes, so the numbers stay while it fades out.
    if (isOpen) {
      forget();
    }
    setOpen(isOpen);
    setCodeStep(undefined);
    setSendError(undefined);
  };

  // Focus goes to the Code field with each change to it, so its new line is read.
  const showInField = (change: (current: CodeStep) => CodeStep) => {
    flushSync(() => setCodeStep((current) => change(current ?? { code: '' })));
    codeRef.current?.focus();
  };

  const send = async () => {
    const isNew = codeStep !== undefined;
    setSendError(undefined);
    try {
      const result = await sendCode.mutateAsync();
      if (result.kind === 'too-many') {
        if (codeStep === undefined) {
          setSendError(tooManyCodes(result.retryAfterSeconds));
          return;
        }
        showInField((current) => ({ ...current, error: tooManyCodes(result.retryAfterSeconds), help: undefined }));
        return;
      }
      showInField(() => ({ code: '', help: isNew ? NEW_CODE_SENT : undefined }));
    } catch {
      toast.error("Couldn't send the code. Check your connection and try again.");
    }
  };

  const remove = async () => {
    if (codeStep === undefined) {
      return;
    }
    const code = codeStep.code.trim();
    if (!CODE_PATTERN.test(code)) {
      showInField((current) => ({ ...current, error: NOT_A_CODE }));
      return;
    }
    try {
      const result = await deleteAccount.mutateAsync(code);
      if (result.kind === 'deleted') {
        toast.success('Your account is deleted.');
        return;
      }
      showInField((current) => ({ ...current, error: result.kind === 'wrong' ? WRONG_CODE : STOPPED }));
    } catch {
      toast.error("Couldn't delete your account. Check your connection and try again.");
    }
  };

  const shared = { title: 'Delete your account?', open, onOpenChange: changeOpen } as const;
  // What goes and what stays: its numbers load as it opens, and Send code is the step's action.
  const sendCodeStep = {
    ...shared,
    error: sendError,
    tone: 'primary',
    confirmLabel: 'Send code',
    pending: sendCode.isPending,
    pendingLabel: 'Sending…',
    onConfirm: () => void send()
  } as const;
  const dialog = () => {
    if (deletion === undefined) {
      // A refetch resets a never-successful query to pending but leaves errorUpdatedAt, so the error stays up
      // through its retry.
      return errorUpdatedAt > 0 ? (
        <ConfirmDialog
          {...sendCodeStep}
          status="error"
          errorTitle="Couldn't reach Tastebook"
          errorText="Check your connection and try again."
          onRetry={refetch}
        />
      ) : (
        <ConfirmDialog {...sendCodeStep} status="loading" loadingLabel="Checking what deleting removes…" />
      );
    }
    if (deletion.is_staff) {
      return <ConfirmDialog {...shared} description={STAFF_REFUSED} notice />;
    }
    if (codeStep === undefined) {
      return <ConfirmDialog {...sendCodeStep} description={whatGoes(deletion)} />;
    }
    return (
      <ConfirmDialog
        {...shared}
        description={[
          <>
            We sent a 6-digit code to <span className="font-extrabold text-ink [overflow-wrap:anywhere]">{email}</span>.
            It works for 10 minutes.
          </>
        ]}
        confirmLabel="Delete account"
        pending={deleteAccount.isPending}
        pendingLabel="Deleting…"
        onConfirm={() => void remove()}
      >
        <Field label="Code" help={codeStep.help} error={codeStep.error}>
          {(control) => (
            <Input
              {...control}
              ref={codeRef}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={codeStep.code}
              onChange={(event) => setCodeStep({ ...codeStep, code: event.target.value })}
            />
          )}
        </Field>
        <div>
          <Button variant="secondary" loading={sendCode.isPending} loadingLabel="Sending…" onClick={() => void send()}>
            Send a new code
          </Button>
        </div>
      </ConfirmDialog>
    );
  };

  return (
    <section aria-labelledby="account-delete" className="flex flex-col gap-4">
      <h2 id="account-delete">Delete your account</h2>
      <p>
        Delete your account and everything only you can see. Public recipes you wrote stay, credited to “a former
        member”.
      </p>
      <div>
        <Button variant="danger" onClick={() => changeOpen(true)}>
          Delete account
        </Button>
      </div>
      {dialog()}
    </section>
  );
};

const AccountSettings = ({ account }: { account: Account }) => (
  <div className="flex max-w-100 flex-col gap-8">
    <h1>
      Your <Squiggle emphasis>account</Squiggle>
    </h1>
    <NameForm name={account.name} />
    <UnitsChoice unitSystem={account.unit_system} />
    <DownloadEverything />
    <DeleteAccount email={account.email} />
  </div>
);

const AccountContent = () => {
  const { account, errorUpdatedAt, refetch } = useSession();
  if (account === null) {
    return <Navigate to="/sign-in?next=%2Faccount" replace />;
  }
  if (account !== undefined) {
    return <AccountSettings account={account} />;
  }
  // A refetch resets a never-successful query to pending but leaves errorUpdatedAt, so the error stays up through its retry.
  if (errorUpdatedAt > 0) {
    return (
      <ErrorWithRetry title="Couldn't reach Tastebook" onRetry={refetch}>
        Check your connection and try again.
      </ErrorWithRetry>
    );
  }
  return <Loading>Checking your account…</Loading>;
};

export const AccountPage = () => (
  <Page>
    <title>Your account · Tastebook</title>
    <AccountContent />
  </Page>
);
