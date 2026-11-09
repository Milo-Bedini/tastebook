import { ChevronDown } from 'lucide-react';
import type { ComponentProps, KeyboardEvent, MouseEvent } from 'react';

import { cn } from '@/dino/cn';
import { fieldControlStates, isAriaDisabled } from '@/dino/field-control';

// Disabled is aria-disabled, never disabled, so the select stays focusable (docs/design.md, States).
type NativeSelectProps = Omit<ComponentProps<'select'>, 'disabled'>;

export const NativeSelect = ({ className, onMouseDown, onKeyDown, ...props }: NativeSelectProps) => {
  const isDisabled = isAriaDisabled(props['aria-disabled']);

  // Blocks opening and changing the value; Tab still moves focus on.
  const mouseDown = (event: MouseEvent<HTMLSelectElement>) => {
    if (isDisabled) {
      event.preventDefault();
    }
    onMouseDown?.(event);
  };
  const keyDown = (event: KeyboardEvent<HTMLSelectElement>) => {
    if (isDisabled && event.key !== 'Tab') {
      event.preventDefault();
    }
    onKeyDown?.(event);
  };

  return (
    <div className="relative">
      <select
        className={cn(
          'h-12 w-full min-w-0 cursor-pointer appearance-none rounded-pill border-2 border-field bg-transparent pr-11.5 pl-4.5 font-bold text-body text-ink transition-colors',
          ...fieldControlStates,
          className
        )}
        onMouseDown={mouseDown}
        onKeyDown={keyDown}
        {...props}
      />
      <ChevronDown
        aria-hidden="true"
        strokeWidth={2.5}
        className="pointer-events-none absolute top-3.5 right-4 size-5 text-muted forced-colors:text-current"
      />
    </div>
  );
};
