import { Lock } from 'lucide-react';

// The word carries the meaning, so the lock is hidden. The transparent border is what forced colours outlines.
export const PrivateMark = () => (
  <span className="inline-flex w-fit items-center gap-1 rounded-check border-2 border-transparent bg-surface py-0.5 pr-2 pl-1.5 text-ink text-small">
    <Lock aria-hidden="true" strokeWidth={2.5} className="size-3.5 shrink-0" />
    Private
  </span>
);
