import { Check, Info } from 'lucide-react';
import { Switch as SwitchPrimitive } from 'radix-ui';
import { useId } from 'react';

import { cn } from '@/dino/cn';

// A disabled switch must say why (docs/design.md, States › Disabled), so the reason is required with it.
type DisabledProps =
  | { disabled?: undefined; disabledReason?: undefined }
  | { disabled: boolean; disabledReason: string };

type SwitchProps = {
  children: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  // What turning it on does, said before it's turned on. A disabled reason takes its place while shown.
  description?: string;
} & DisabledProps;

export const Switch = ({ children, checked, onCheckedChange, description, disabled, disabledReason }: SwitchProps) => {
  const id = useId();
  const reasonId = useId();
  const descriptionId = useId();
  const describedBy = disabled ? reasonId : description === undefined ? undefined : descriptionId;

  // Controlled, so ignoring the change leaves a disabled switch as it was, however it was pressed.
  const handleCheckedChange = (next: boolean) => {
    if (!disabled) onCheckedChange(next);
  };

  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={id}
        className={cn(
          'group -mx-2 flex min-h-12 items-start gap-4 rounded-row p-2 text-body transition-colors has-focus-visible:outline-3 has-focus-visible:outline-ink has-focus-visible:-outline-offset-1',
          disabled
            ? 'cursor-not-allowed text-muted forced-colors:text-[GrayText]'
            : 'cursor-pointer text-ink hover:bg-surface'
        )}
      >
        <span className="min-w-0 grow pt-1">{children}</span>
        <SwitchPrimitive.Root
          id={id}
          checked={checked}
          onCheckedChange={handleCheckedChange}
          // aria-disabled rather than disabled, so the switch stays focusable and reads its reason.
          aria-disabled={disabled || undefined}
          aria-describedby={describedBy}
          className={cn(
            // The row carries the focus ring, so the switch doesn't draw its own.
            'relative h-8 w-13 shrink-0 rounded-pill border-2 transition focus-visible:outline-none',
            disabled
              ? 'cursor-not-allowed border-field border-dashed bg-surface forced-colors:border-[GrayText]'
              : // A system colour, as Chrome's forced colours otherwise keeps painting the hover border once transitions
                // are off under reduced motion.
                'cursor-pointer group-active:scale-94 forced-colors:border-[CanvasText]',
            !disabled && !checked && 'border-field group-hover:border-ink group-active:border-ink group-active:bg-line',
            // On, the border turns transparent rather than going, so forced colours still draws the track.
            !disabled && checked && 'border-transparent bg-mint group-hover:bg-mint-hover group-active:bg-mint-pressed'
          )}
        >
          <SwitchPrimitive.Thumb
            className={cn(
              'absolute top-1 left-1 flex size-5 items-center justify-center rounded-pill border-2 border-transparent transition',
              checked && 'translate-x-5',
              disabled && 'bg-field text-ground forced-colors:border-[GrayText] forced-colors:text-[GrayText]',
              !disabled && (checked ? 'bg-on-pastel text-mint' : 'bg-muted')
            )}
          >
            {checked && <Check aria-hidden="true" className="size-3" strokeWidth={4} />}
          </SwitchPrimitive.Thumb>
        </SwitchPrimitive.Root>
      </label>
      {disabled && (
        <p id={reasonId} className="flex items-start gap-2 text-small text-muted">
          <Info aria-hidden="true" className="mt-px size-4 shrink-0" strokeWidth={2.5} />
          {disabledReason}
        </p>
      )}
      {!disabled && description !== undefined && (
        <p id={descriptionId} className="px-2 text-small text-muted">
          {description}
        </p>
      )}
    </div>
  );
};
