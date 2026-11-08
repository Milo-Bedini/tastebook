import { Check } from 'lucide-react';
import { useId } from 'react';

import { cn } from '@/dino/cn';

type SegmentedControlOption<Value extends string> = {
  value: Value;
  label: string;
};

type SegmentedControlProps<Value extends string> = {
  label: string;
  // In a form, the label shows above the track as a field's does; elsewhere only screen readers hear it.
  labelVisible?: boolean;
  // What the chosen option means, under the track.
  description?: string;
  options: SegmentedControlOption<Value>[];
  value: Value;
  onValueChange: (value: Value) => void;
};

const track =
  'inline-flex gap-0.5 rounded-pill bg-surface p-0.75 has-focus-visible:outline-3 has-focus-visible:outline-ink';
const segment =
  'relative inline-flex h-11 items-center gap-1.5 rounded-pill border-2 border-transparent px-4.5 text-label text-muted transition';
const segmentChosen = 'bg-mint pl-3 text-on-pastel';
const segmentOther = 'hover:bg-line hover:text-ink active:scale-97';

export const SegmentedControl = <Value extends string>({
  label,
  labelVisible = false,
  description,
  options,
  value,
  onValueChange
}: SegmentedControlProps<Value>) => {
  const name = useId();
  const segments = options.map((option) => {
    const chosen = option.value === value;
    return (
      <label key={option.value} className={cn(segment, chosen ? segmentChosen : segmentOther)}>
        {/* Covers the whole segment, border included, not visually hidden, so its target is the segment's 44 px. */}
        <input
          type="radio"
          name={name}
          value={option.value}
          checked={chosen}
          onChange={() => onValueChange(option.value)}
          className="-inset-0.5 absolute m-0 cursor-pointer appearance-none rounded-pill opacity-0"
        />
        {chosen && <Check aria-hidden="true" className="size-4" strokeWidth={3} />}
        {option.label}
      </label>
    );
  });

  if (!labelVisible && description === undefined) {
    return (
      <fieldset className={track}>
        <legend className="sr-only">{label}</legend>
        {segments}
      </fieldset>
    );
  }
  const descriptionId = `${name}-description`;
  return (
    // Described, not live: the chosen segment's name is heard as it's chosen, and the line on the next read.
    <fieldset
      aria-describedby={description === undefined ? undefined : descriptionId}
      className="m-0 flex min-w-0 flex-col items-start gap-1.5 border-0 p-0"
    >
      <legend className={labelVisible ? 'mb-1.5 p-0 text-label' : 'sr-only'}>{label}</legend>
      <div className={track}>{segments}</div>
      {description !== undefined && (
        <p id={descriptionId} className="text-muted text-small">
          {description}
        </p>
      )}
    </fieldset>
  );
};
