import type { ReactNode } from 'react';
import { Navigate } from 'react-router';

import { ErrorWithRetry, Loading } from '../dino';
import { useSession } from '../households';

type SignedInOnlyProps = { path: string; children: ReactNode };

// Lists are an account's own, so signed out the page goes to sign-in and comes back; nothing shows first.
export const SignedInOnly = ({ path, children }: SignedInOnlyProps) => {
  const { account, errorUpdatedAt, refetch } = useSession();
  if (account === null) {
    return <Navigate to={`/sign-in?next=${encodeURIComponent(path)}`} replace />;
  }
  if (account !== undefined) {
    return children;
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
