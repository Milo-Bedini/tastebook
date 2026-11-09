import { Check, CircleAlert } from 'lucide-react';
import { useId } from 'react';

import { cn } from '@/dino/cn';

type RadioListOption<Value extends string> = {
  value: Value;
  label: string;
  hint?: string;
};

// A disabled list must say why (docs/design.md, States › Disabled), so the reason is required with it.
type DisabledProps =
  | { disabled?: undefined; disabledReason?: undefined }
  | { disabled: boolean; disabledReason: string };

type RadioListProps<Value extends string> = {
  legend: string;
  name: string;
  options: RadioListOption<Value>[];
  // Nothing is chosen until the person picks an option.
  value?: Value;
  onValueChange: (value: Value) => void;
  error?: string;
} & DisabledProps;

export const RadioList = <Value extends string>({
  legend,
  name,
  options,
  value,
  onValueChange,
  error,
  disabled,
  disabledReason
}: RadioListProps<Value>) => {
  const id = useId();
  const errorId = `${id}-error`;
  const reasonId = `${id}-reason`;
  const listDescribedBy = [error && errorId, disabled && reasonId].filter(Boolean).join(' ');

  const rows = options.map((option, index) => {
    const chosen = option.value === value;
    const labelId = `${id}-${index}-label`;
    const hintId = `${id}-${index}-hint`;
    const describedBy = [option.hint !== undefined && hintId, listDescribedBy].filter(Boolean).join(' ');
    return (
      <label
        key={option.value}
        className={cn(
          'group relative flex min-h-14 items-center gap-3 rounded-row py-1.5 pr-2 pl-3 transition-colors duration-120 ease-out has-focus-visible:outline-3 has-focus-visible:outline-ink',
          disabled ? 'cursor-default' : 'cursor-pointer hover:bg-line active:bg-surface-pressed'
        )}
      >
        {/* Covers the whole row, not visually hidden, so its target is the row's 56 px. */}
        <input
          type="radio"
          name={name}
          value={option.value}
          checked={chosen}
          // Controlled, so ignoring a change leaves a disabled list as it was, however it was pressed.
          onChange={() => {
            if (!disabled) onValueChange(option.value);
          }}
          // aria-disabled rather than disabled, so the list stays focusable and reads its reason.
          aria-disabled={disabled || undefined}
          aria-invalid={error ? true : undefined}
          aria-labelledby={labelId}
          aria-describedby={describedBy || undefined}
          className={cn(
            'absolute inset-0 m-0 appearance-none rounded-row opacity-0',
            disabled ? 'cursor-default' : 'cursor-pointer'
          )}
        />
        <span className="flex min-w-0 grow flex-col">
          <span
            id={labelId}
            className={cn('break-words text-body', disabled && 'text-muted forced-colors:text-[GrayText]')}
          >
            {option.label}
          </span>
          {option.hint !== undefined && (
            <span id={hintId} className={cn('text-muted text-small', disabled && 'forced-colors:text-[GrayText]')}>
              {option.hint}
            </span>
          )}
        </span>
        <span
          aria-hidden="true"
          className={cn(
            // Chosen, the ring turns transparent rather than going, so forced colours still draws the box.
            'grid size-7 shrink-0 place-items-center rounded-pill border-2 text-on-pastel transition-transform',
            disabled &&
              'border-field border-dashed bg-surface text-field forced-colors:border-[GrayText] forced-colors:text-[GrayText]',
            !disabled && chosen && 'border-transparent bg-mint',
            !disabled && !chosen && (error ? 'border-danger' : 'border-field'),
            !disabled &&
              chosen &&
              'group-hover:bg-mint-hover group-active:bg-mint-pressed forced-colors:border-[Highlight] forced-colors:bg-[Highlight] forced-colors:text-[HighlightText] forced-colors:group-hover:bg-[Highlight] forced-colors:group-active:bg-[Highlight]',
            !disabled && !chosen && 'group-hover:border-ink',
            !disabled && 'group-active:scale-92'
          )}
        >
          {chosen && <Check aria-hidden="true" className="size-4.5" strokeWidth={3} />}
        </span>
      </label>
    );
  });

  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-0.5 border-0 p-0">
      <legend className="pb-1.5 text-label">{legend}</legend>
      {rows}
      {error && (
        <p id={errorId} className="flex items-start gap-1.5 px-3 pt-1 text-danger text-small">
          <CircleAlert aria-hidden="true" className="mt-px size-4 shrink-0" strokeWidth={2.25} />
          {error}
        </p>
      )}
      {disabled && (
        <p id={reasonId} className="px-3 pt-1 text-muted text-small">
          {disabledReason}
        </p>
      )}
    </fieldset>
  );
};
