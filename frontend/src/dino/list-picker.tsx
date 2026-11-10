import { CircleAlert } from 'lucide-react';
import { type ReactNode, useId } from 'react';

import { Checkbox } from '@/dino/checkbox';
import { cn } from '@/dino/cn';

type ListPickerProps = {
  legend: string;
  children: ReactNode;
};

// One group of lists; the caller stacks the groups and puts them in order.
export const ListPicker = ({ legend, children }: ListPickerProps) => (
  <fieldset className="m-0 flex min-w-0 flex-col gap-0.5 border-0 p-0">
    <legend className="pb-1.5 text-label">{legend}</legend>
    {children}
  </fieldset>
);

type ListPickerRowProps = {
  name: string;
  // The caller's words for what the list holds: "7 recipes", "Nothing here yet".
  count: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  saving?: boolean;
  error?: string;
};

export const ListPickerRow = ({ name, count, checked, onCheckedChange, saving, error }: ListPickerRowProps) => {
  const id = useId();
  const nameId = `${id}-name`;
  const countId = `${id}-count`;
  const errorId = `${id}-error`;

  return (
    <div>
      <label
        htmlFor={id}
        className={cn(
          'group flex min-h-14 cursor-pointer items-center gap-3 rounded-row py-1.5 pr-2 pl-3 transition-colors duration-120 ease-out has-focus-visible:outline-3 has-focus-visible:outline-ink',
          !saving && 'hover:bg-line active:bg-surface-pressed'
        )}
      >
        <span className="flex min-w-0 grow flex-col">
          <span id={nameId} className="break-words text-body">
            {name}
          </span>
          <span id={countId} className="text-muted text-small">
            {count}
          </span>
        </span>
        <Checkbox
          id={id}
          checked={checked}
          // Controlled, so ignoring a press while saving leaves the box as it is.
          onCheckedChange={(state) => {
            if (!saving) onCheckedChange(state === true);
          }}
          aria-labelledby={nameId}
          aria-describedby={error ? `${countId} ${errorId}` : countId}
          aria-busy={saving || undefined}
          className={cn(
            // The row carries the focus ring, so the box doesn't draw its own.
            'focus-visible:outline-none forced-colors:data-[state=checked]:border-[Highlight] forced-colors:data-[state=checked]:bg-[Highlight] forced-colors:data-[state=checked]:text-[HighlightText]',
            !saving &&
              'group-hover:data-[state=unchecked]:border-ink group-hover:data-[state=checked]:bg-mint-hover group-active:scale-92 group-active:data-[state=checked]:bg-mint-pressed forced-colors:group-hover:data-[state=checked]:bg-[Highlight] forced-colors:group-active:data-[state=checked]:bg-[Highlight]'
          )}
        />
      </label>
      {error && (
        <p id={errorId} role="alert" className="flex items-start gap-1.5 px-3 pt-1 text-danger text-small">
          <CircleAlert aria-hidden="true" className="mt-px size-4 shrink-0" strokeWidth={2.25} />
          {error}
        </p>
      )}
    </div>
  );
};
