import { type ReactNode, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';

import type { components } from '../api/schema';
import { Avatar, Button, ConfirmDialog, ErrorWithRetry, Loading, Page, Squiggle, toast } from '../dino';
import { type Household, useHousehold } from './household-api';
import { useInvite, useJoinHousehold } from './join-api';
import { useSession } from './session-api';

type InvitedHousehold = components['schemas']['InvitedHousehold'];

type DeadReason = 'unknown' | 'expired' | 'cancelled';

const DEAD_LINKS: Record<DeadReason, { title: string; text: string }> = {
  unknown: {
    title: "This invite link doesn't work",
    text: "Check you have the whole link: it can get cut short when it's copied. If it still doesn't work, ask whoever sent it for a new one."
  },
  expired: {
    title: 'This invite link has expired',
    text: 'Invite links work for 7 days. Ask whoever sent it for a new one.'
  },
  cancelled: {
    title: 'This invite link was cancelled',
    text: "Someone in the household cancelled it. Ask them for a new one if you'd still like to join."
  }
};

// As on the household page: focus moves at the commit that shows the dead link, after the dialog's trigger has gone.
const focusOn = (element: HTMLElement | null) => element?.focus();

type StatementProps = {
  title: ReactNode;
  text: string;
  action: ReactNode;
  takeFocus?: boolean;
};

// The join page's answers other than the offer: a title, what's true and what to do, and one button.
const Statement = ({ title, text, action, takeFocus = false }: StatementProps) => (
  <div className="flex max-w-100 flex-col gap-8">
    <div className="flex flex-col gap-4">
      <h1 ref={takeFocus ? focusOn : undefined} tabIndex={-1}>
        {title}
      </h1>
      <p>{text}</p>
    </div>
    <div className="flex flex-wrap items-start gap-2">
      <Button asChild>{action}</Button>
    </div>
  </div>
);

const DeadLink = ({ reason, takeFocus }: { reason: DeadReason; takeFocus: boolean }) => (
  <Statement
    title={DEAD_LINKS[reason].title}
    text={DEAD_LINKS[reason].text}
    action={<Link to="/">Back to Tastebook</Link>}
    takeFocus={takeFocus}
  />
);

const AlreadyMember = ({ household }: { household: InvitedHousehold }) => (
  <Statement
    title={`You're already in ${household.name}`}
    text="This is your household's invite link. Send it to anyone you'd like to join you."
    action={<Link to="/household">Go to your household</Link>}
  />
);

const SignInToJoin = ({ token }: { token: string }) => (
  <Statement
    title={
      <>
        You've been <Squiggle emphasis>invited</Squiggle> to a household
      </>
    }
    text="Sign in to see who's in it and join them. New to Tastebook? Signing in makes your account."
    action={<Link to={`/sign-in?next=${encodeURIComponent(`/join/${token}`)}`}>Sign in to join</Link>}
  />
);

const names = new Intl.ListFormat('en-GB', { type: 'conjunction' });

const whatHappensTo = (yours: Household) => {
  const others = yours.members.filter((member) => !member.is_you);
  if (others.length === 0) {
    return `You'll leave ${yours.name}. You're its only member, so it will be deleted.`;
  }
  return `You'll leave ${yours.name}. ${names.format(others.map((member) => member.name))} ${others.length === 1 ? 'stays' : 'stay'} in it.`;
};

type JoinDialogProps = { household: InvitedHousehold; yours: Household; joining: boolean; onJoin: () => void };

const JoinDialog = ({ household, yours, joining, onJoin }: JoinDialogProps) => (
  <ConfirmDialog
    trigger={
      <Button loading={joining} loadingLabel="Joining…">
        Join household
      </Button>
    }
    title={`Join ${household.name}?`}
    description={whatHappensTo(yours)}
    confirmLabel="Join household"
    onConfirm={onJoin}
  />
);

type JoinOfferProps = { household: InvitedHousehold; token: string; onDead: () => void };

const JoinOffer = ({ household, token, onDead }: JoinOfferProps) => {
  const { household: yours, errorUpdatedAt, refetch } = useHousehold();
  const joinHousehold = useJoinHousehold(token);
  const navigate = useNavigate();

  const join = async () => {
    try {
      const result = await joinHousehold.mutateAsync();
      if (result.kind === 'dead') {
        toast.info('This invite link stopped working before you joined.');
        onDead();
        return;
      }
      toast.success(`You joined ${household.name}`);
      // Replaced, so Back doesn't return to a link that's been used.
      void navigate('/household', { replace: true });
    } catch {
      toast.error("Couldn't join the household. Check your connection and try again.");
    }
  };

  if (yours === undefined) {
    // errorUpdatedAt survives the retry's reset to pending, so the error stays up through it.
    if (errorUpdatedAt > 0) {
      return (
        <ErrorWithRetry title="Couldn't load your household" onRetry={refetch}>
          Check your connection and try again.
        </ErrorWithRetry>
      );
    }
    return <Loading>Getting your household…</Loading>;
  }

  return (
    <div className="flex max-w-100 flex-col gap-8">
      <h1>
        <Squiggle emphasis>Join</Squiggle> {household.name}
      </h1>
      <section aria-labelledby="join-members" className="flex flex-col gap-4">
        <h2 id="join-members">Members</h2>
        <ul aria-labelledby="join-members" className="flex flex-col">
          {household.members.map((member) => (
            <li
              key={member.id}
              className="flex min-h-14 items-center gap-3 border-line border-t py-1.5 text-body wrap-anywhere first:border-t-0"
            >
              <Avatar name={member.name} />
              <span className="min-w-0 flex-auto">{member.name}</span>
            </li>
          ))}
        </ul>
      </section>
      <div className="flex flex-wrap items-start gap-2">
        <JoinDialog household={household} yours={yours} joining={joinHousehold.isPending} onJoin={join} />
      </div>
    </div>
  );
};

const InviteDetails = ({ token, signedIn }: { token: string; signedIn: boolean }) => {
  const { lookup, errorUpdatedAt, refetch } = useInvite(token);
  // The link died between opening it and confirming: the offer's trigger has gone, so the dead link's title takes focus.
  const [wentDead, setWentDead] = useState(false);

  if (lookup === undefined) {
    if (errorUpdatedAt > 0) {
      return (
        <ErrorWithRetry title="Couldn't open this invite link" onRetry={refetch}>
          Check your connection and try again.
        </ErrorWithRetry>
      );
    }
    return <Loading>Opening the invite link…</Loading>;
  }
  if (lookup.kind === 'unknown') {
    return <DeadLink reason="unknown" takeFocus={wentDead} />;
  }
  const { invite } = lookup;
  if (invite.is_member && invite.household !== null) {
    return <AlreadyMember household={invite.household} />;
  }
  if (invite.status !== 'live') {
    return <DeadLink reason={invite.status} takeFocus={wentDead} />;
  }
  if (!signedIn || invite.household === null) {
    return <SignInToJoin token={token} />;
  }
  return <JoinOffer household={invite.household} token={token} onDead={() => setWentDead(true)} />;
};

const JoinContent = () => {
  const { token = '' } = useParams();
  const { account, errorUpdatedAt, refetch } = useSession();
  if (account !== undefined) {
    return <InviteDetails key={token} token={token} signedIn={account !== null} />;
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

export const JoinPage = () => (
  <Page>
    <title>Join a household · Tastebook</title>
    <JoinContent />
  </Page>
);
