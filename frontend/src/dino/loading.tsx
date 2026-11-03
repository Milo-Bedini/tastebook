import { cn } from '@/dino/cn';
import type { Lean } from '@/dino/polaroid';
import { Spinner } from '@/dino/spinner';

const leanStyles: Record<Lean, string> = { left: '-rotate-3', right: 'rotate-3' };

type BlankPolaroidProps = { lean: Lean };

// The transparent border is what forced colours draws. Nothing on it moves (docs/design.md, States › Loading).
const BlankPolaroid = ({ lean }: BlankPolaroidProps) => (
  <span
    className={cn(
      'flex w-30 flex-col border-2 border-transparent bg-surface px-2 pt-2 pb-2.5 large-text:rotate-0',
      leanStyles[lean]
    )}
  >
    <span className="block aspect-4/3 bg-line" />
    <span className="mt-2 block h-2.5 w-16 rounded-pill bg-line" />
  </span>
);

type LoadingProps = {
  // What's happening, as an "-ing" line: "Finding recipes…".
  children: string;
};

export const Loading = ({ children }: LoadingProps) => (
  <div aria-busy="true" className="flex animate-reveal flex-col gap-4">
    <div aria-hidden="true" className="flex gap-4.5 px-1 pt-1.5">
      <BlankPolaroid lean="left" />
      <BlankPolaroid lean="right" />
    </div>
    <p role="status" className="flex items-center gap-2.5 text-label">
      <Spinner className="size-4.5" />
      {children}
    </p>
  </div>
);
