import { type FormEvent, useRef, useState } from 'react';
import { Navigate } from 'react-router';

import { Avatar, Button, ConfirmDialog, ErrorWithRetry, Field, Input, Loading, Page, Squiggle, toast } from '../dino';
import {
  HOUSEHOLD_NAME_MAX_LENGTH,
  type Household,
  type Member,
  NOT_A_HOUSEHOLD_NAME,
  useHousehold,
  useLeaveHousehold,
  useRemoveMember,
  useRenameHousehold
} from './household-api';
import { useSession } from './session-api';

const HouseholdNameForm = ({ name: savedName }: { name: string }) => {
  const renameHousehold = useRenameHousehold();
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
      refuse(NOT_A_HOUSEHOLD_NAME);
      return;
    }
    try {
      const result = await renameHousehold.mutateAsync(trimmed);
      if (result.kind === 'refused') {
        refuse(result.message);
        return;
      }
      setName(result.household.name);
      toast.success('Household name saved');
    } catch {
      toast.error("Couldn't save the household's name. Check your connection and try again.");
    }
  };

  return (
    <section aria-labelledby="household-name" className="flex flex-col gap-4">
      <h2 id="household-name">Name</h2>
      <form noValidate onSubmit={submit} className="flex flex-col gap-5">
        <Field label="Household name" help="Everyone in the household sees it." error={error}>
          {(control) => (
            <Input
              {...control}
              ref={nameRef}
              autoComplete="off"
              maxLength={HOUSEHOLD_NAME_MAX_LENGTH}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </Field>
        <div className="flex flex-wrap items-start gap-2">
          <Button type="submit" loading={renameHousehold.isPending} loadingLabel="Saving…">
            Save name
          </Button>
        </div>
      </form>
    </section>
  );
};

type RemoveMemberProps = { member: Member; householdName: string; removing: boolean; onRemove: () => void };

const RemoveMember = ({ member, householdName, removing, onRemove }: RemoveMemberProps) => (
  <ConfirmDialog
    trigger={
      <Button variant="secondary" loading={removing} loadingLabel="Removing…">
        Remove <span className="sr-only">{member.name}</span>
      </Button>
    }
    title={`Remove ${member.name} from ${householdName}?`}
    description={`${member.name} will move to a household of their own, and we'll email them to say you removed them.`}
    confirmLabel="Remove member"
    onConfirm={onRemove}
  />
);

// Focus moves at the commit that drops the dialog's trigger, not when the request settles: the dialog hands focus back
// to its trigger as it closes, and the query's new data reaches the page a tick after the request.
const takeFocus = (element: HTMLElement | null) => element?.focus();

const Members = ({ household }: { household: Household }) => {
  const removeMember = useRemoveMember();
  const [removed, setRemoved] = useState<number>();
  // The row that held focus has gone.
  const removedRowGone = removed !== undefined && household.members.every((member) => member.id !== removed);

  const remove = async (member: Member) => {
    try {
      const result = await removeMember.mutateAsync(member);
      // Either way the row goes, so focus needs somewhere to land.
      setRemoved(member.id);
      if (result.kind === 'gone') {
        toast.info(`${member.name} isn't in your household any more.`);
        return;
      }
      toast.success(`Removed ${member.name}`);
    } catch {
      toast.error(`Couldn't remove ${member.name}. Check your connection and try again.`);
    }
  };

  return (
    <section aria-labelledby="household-members" className="flex flex-col gap-4">
      <h2 id="household-members" ref={removedRowGone ? takeFocus : undefined} tabIndex={-1}>
        Members
      </h2>
      <ul aria-labelledby="household-members" className="flex flex-col">
        {household.members.map((member) => (
          <li
            key={member.id}
            className="flex min-h-14 items-center gap-3 border-line border-t py-1.5 text-body wrap-anywhere first:border-t-0"
          >
            <Avatar name={member.name} />
            <span className="min-w-0 flex-auto">
              {member.name}
              {member.is_you ? <span className="text-muted"> (you)</span> : null}
            </span>
            {member.is_you ? null : (
              <RemoveMember
                member={member}
                householdName={household.name}
                removing={removeMember.isPending && removeMember.variables?.id === member.id}
                onRemove={() => remove(member)}
              />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
};

const names = new Intl.ListFormat('en-GB', { type: 'conjunction' });

const whoStays = (household: Household) => {
  const others = household.members.filter((member) => !member.is_you);
  return `${names.format(others.map((member) => member.name))} ${others.length === 1 ? 'stays' : 'stay'} in ${household.name}.`;
};

const LeaveHousehold = ({ household, onLeft }: { household: Household; onLeft: () => void }) => {
  const leaveHousehold = useLeaveHousehold();

  const leave = async () => {
    // The response is the new household, so the old name is kept for the toast.
    const left = household.name;
    try {
      await leaveHousehold.mutateAsync();
      toast.success(`You left ${left}`);
      onLeft();
    } catch {
      toast.error("Couldn't leave the household. Check your connection and try again.");
    }
  };

  return (
    <section aria-labelledby="household-leave" className="flex flex-col gap-4">
      <h2 id="household-leave">Leave</h2>
      <p>Move to a household of your own. Everyone else stays in {household.name}.</p>
      <div className="flex flex-wrap items-start gap-2">
        <ConfirmDialog
          trigger={
            <Button variant="secondary" loading={leaveHousehold.isPending} loadingLabel="Leaving…">
              Leave household
            </Button>
          }
          title={`Leave ${household.name}?`}
          description={`You'll move to a household of your own. ${whoStays(household)}`}
          confirmLabel="Leave household"
          onConfirm={leave}
        />
      </div>
    </section>
  );
};

const HouseholdSettings = ({ household }: { household: Household }) => {
  const [left, setLeft] = useState<number>();
  return (
    <div className="flex max-w-100 flex-col gap-8">
      <h1 ref={left !== undefined && household.id !== left ? takeFocus : undefined} tabIndex={-1}>
        Your <Squiggle emphasis>household</Squiggle>
      </h1>
      {/* Keyed on the household, so after leaving the field shows the new one's name rather than the old. */}
      <HouseholdNameForm key={household.id} name={household.name} />
      <Members household={household} />
      {household.members.length > 1 ? (
        <LeaveHousehold household={household} onLeft={() => setLeft(household.id)} />
      ) : null}
    </div>
  );
};

// Only rendered once someone is signed in, so a visitor never asks for a household.
const HouseholdDetails = () => {
  const { household, errorUpdatedAt, refetch } = useHousehold();
  if (household !== undefined) {
    return <HouseholdSettings household={household} />;
  }
  // As on the account page: errorUpdatedAt survives the retry's reset to pending, so the error stays up through it.
  if (errorUpdatedAt > 0) {
    return (
      <ErrorWithRetry title="Couldn't load your household" onRetry={refetch}>
        Check your connection and try again.
      </ErrorWithRetry>
    );
  }
  return <Loading>Getting your household…</Loading>;
};

const HouseholdContent = () => {
  const { account, errorUpdatedAt, refetch } = useSession();
  if (account === null) {
    return <Navigate to="/sign-in?next=%2Fhousehold" replace />;
  }
  if (account !== undefined) {
    return <HouseholdDetails />;
  }
  if (errorUpdatedAt > 0) {
    return (
      <ErrorWithRetry title="Couldn't reach Tastebook" onRetry={refetch}>
        Check your connection and try again.
      </ErrorWithRetry>
    );
  }
  return <Loading>Checking your account…</Loading>;
};

export const HouseholdPage = () => (
  <Page>
    <title>Your household · Tastebook</title>
    <HouseholdContent />
  </Page>
);
