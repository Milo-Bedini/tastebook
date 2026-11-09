import { type FormEvent, useRef, useState } from 'react';
import { Navigate } from 'react-router';

import type { components } from '../api/schema';
import { Button, ErrorWithRetry, Field, Input, Loading, Page, SegmentedControl, Squiggle, toast } from '../dino';
import type { Account } from './auth-api';
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

const AccountSettings = ({ account }: { account: Account }) => (
  <div className="flex max-w-100 flex-col gap-8">
    <h1>
      Your <Squiggle emphasis>account</Squiggle>
    </h1>
    <NameForm name={account.name} />
    <UnitsChoice unitSystem={account.unit_system} />
    <DownloadEverything />
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
