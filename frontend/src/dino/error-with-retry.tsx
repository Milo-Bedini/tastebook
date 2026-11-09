import { CircleAlert } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';

import { Button } from '@/dino/button';

type ErrorWithRetryProps = {
  // What failed, short: "Couldn't load recipes".
  title: string;
  // How to fix it: "Check your connection, then try again."
  children: ReactNode;
  // Resolves when the retry has finished, whatever its result. A query's refetch fits.
  onRetry: () => Promise<unknown>;
};

export const ErrorWithRetry = ({ title, children, onRetry }: ErrorWithRetryProps) => {
  const titleId = useId();
  // Owned here: a refetch resets a never-successful query's error, so a page can't tell a retry from a first load.
  const [isRetrying, setIsRetrying] = useState(false);
  const retry = async () => {
    setIsRetrying(true);
    try {
      await onRetry();
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <div
      role="alert"
      className="flex w-full flex-col items-center gap-2.5 rounded-card border border-line p-6 text-center"
    >
      <CircleAlert aria-hidden="true" strokeWidth={2.25} className="size-8 text-danger forced-colors:text-current" />
      <p id={titleId} className="font-serif text-title italic">
        {title}
      </p>
      <p className="text-muted">{children}</p>
      <Button
        variant="secondary"
        className="mt-1"
        loading={isRetrying}
        loadingLabel="Trying…"
        aria-describedby={titleId}
        onClick={() => void retry()}
      >
        Try again
      </Button>
    </div>
  );
};
