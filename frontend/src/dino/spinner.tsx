import { cn } from '@/dino/cn';

type SpinnerProps = { className?: string };

// Something that's working (docs/design.md, States › Loading). Reduced motion stops it, as it does all motion.
export const Spinner = ({ className }: SpinnerProps) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={cn('animate-spin motion-reduce:animate-none', className)}>
    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
    <path d="M12 3a9 9 0 0 1 9 9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  </svg>
);
