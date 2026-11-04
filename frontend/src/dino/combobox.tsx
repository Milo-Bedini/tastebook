import { CornerDownLeft, Plus } from 'lucide-react';
import { type ChangeEvent, type KeyboardEvent, type Ref, useEffect, useId, useRef, useState } from 'react';

import { cn } from '@/dino/cn';
import { Field } from '@/dino/field';
import { Input } from '@/dino/input';
import { matchRange } from '@/dino/match-range';
import { RemovableChip } from '@/dino/removable-chip';

export type ComboboxOption = { value: string; name: string; hint?: string };

type ComboboxProps = {
  label: string;
  placeholder?: string;
  // What matches the search, without the chosen ones; the caller filters.
  options: ComboboxOption[];
  chosen: Pick<ComboboxOption, 'value' | 'name'>[];
  search: string;
  onSearchChange: (search: string) => void;
  onChoose: (value: string) => void;
  onRemove: (value: string) => void;
  // Each chip's accessible name is `${removeLabel}: ${name}`, like the board's "Remove ingredient: Onion".
  removeLabel: string;
  emptyText: string;
  // Opens the list on first render; the open-list story needs it, since play's focus is blurred before the shot.
  defaultOpen?: boolean;
  // A last option below the matches, such as "Add “chipotle paste”"; the caller decides when there is one.
  addOption?: { label: string; onAdd: () => void };
  // Set on the input alongside the combobox's own, so a caller can put focus back on it.
  inputRef?: Ref<HTMLInputElement>;
};

// The add option is one more item after the options, so it has no value of its own.
type Active = { kind: 'option'; value: string } | { kind: 'add' } | null;

const optionId = (comboboxId: string, index: number) => `${comboboxId}-option-${index}`;

const addOptionId = (comboboxId: string) => `${comboboxId}-add`;

const setRef = <T,>(ref: Ref<T> | undefined, value: T | null) => {
  if (typeof ref === 'function') {
    ref(value);
  } else if (ref) {
    ref.current = value;
  }
};

const optionClassName =
  'flex min-h-12 cursor-pointer items-center justify-between gap-2 rounded-option px-3.5 py-3 text-body text-ink aria-selected:bg-line aria-selected:outline-3 aria-selected:-outline-offset-3 aria-selected:outline-ink';

const ActiveMark = () => <CornerDownLeft aria-hidden="true" strokeWidth={2.5} className="size-4 shrink-0" />;

const Highlighted = ({ text, range }: { text: string; range: ReturnType<typeof matchRange> }) => {
  if (range === null || range.start === range.end) {
    return text;
  }
  return (
    <>
      {text.slice(0, range.start)}
      <b className="font-extrabold">{text.slice(range.start, range.end)}</b>
      {text.slice(range.end)}
    </>
  );
};

const OptionText = ({ name, hint, search }: Omit<ComboboxOption, 'value'> & { search: string }) => {
  const nameRange = matchRange(name, search);
  const boldsName = nameRange !== null && nameRange.end > nameRange.start;
  return (
    // One inline child, and the space outside the muted span, so neither the flex layout nor the option's
    // accessible name drops the space.
    <span>
      <Highlighted text={name} range={nameRange} />
      {hint !== undefined && (
        <>
          {' '}
          <span className="text-muted">
            · <Highlighted text={hint} range={boldsName ? null : matchRange(hint, search)} />
          </span>
        </>
      )}
    </span>
  );
};

export const Combobox = ({
  label,
  placeholder,
  options,
  chosen,
  search,
  onSearchChange,
  onChoose,
  onRemove,
  removeLabel,
  emptyText,
  defaultOpen = false,
  addOption,
  inputRef: callerInputRef
}: ComboboxProps) => {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(defaultOpen);
  const [active, setActive] = useState<Active>(null);

  const itemCount = options.length + (addOption === undefined ? 0 : 1);
  const expanded = open && itemCount > 0;
  // With nothing active, or an option that left the list, the first item is active.
  const activeIndex =
    active?.kind === 'add' && addOption !== undefined
      ? options.length
      : Math.max(
          0,
          options.findIndex((option) => active?.kind === 'option' && option.value === active.value)
        );
  const itemId = (index: number) => (index < options.length ? optionId(id, index) : addOptionId(id));
  const activeId = itemId(activeIndex);
  const listboxId = `${id}-listbox`;

  useEffect(() => {
    if (expanded) {
      document.getElementById(activeId)?.scrollIntoView({ block: 'nearest' });
    }
  }, [expanded, activeId]);

  const activeAt = (index: number): Active => {
    const option = options[index];
    if (option !== undefined) {
      return { kind: 'option', value: option.value };
    }
    return addOption === undefined ? null : { kind: 'add' };
  };

  const choose = (value: string) => {
    onChoose(value);
    onSearchChange('');
    setOpen(false);
    setActive(null);
  };

  // The search stays: the caller clears it once what it adds is in.
  const add = () => {
    addOption?.onAdd();
    setOpen(false);
    setActive(null);
  };

  const remove = (value: string) => {
    onRemove(value);
    // The chip is gone, so focus would otherwise fall to the page.
    inputRef.current?.focus();
  };

  const type = (event: ChangeEvent<HTMLInputElement>) => {
    onSearchChange(event.target.value);
    setOpen(true);
    setActive(null);
  };

  const move = (step: 1 | -1) => {
    if (!expanded) {
      setOpen(true);
      setActive(activeAt(step === 1 ? 0 : itemCount - 1));
      return;
    }
    setActive(activeAt((activeIndex + step + itemCount) % itemCount));
  };

  const closeOrClear = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!open && search === '') {
      // Left alone, so an enclosing sheet can close on it.
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (open) {
      setOpen(false);
    } else {
      onSearchChange('');
    }
  };

  const keyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      move(event.key === 'ArrowDown' ? 1 : -1);
    } else if (event.key === 'Enter' && expanded) {
      event.preventDefault();
      const option = options[activeIndex];
      if (option) {
        choose(option.value);
      } else {
        add();
      }
    } else if (event.key === 'Escape') {
      closeOrClear(event);
    }
  };

  return (
    <Field label={label}>
      {(control, { labelId }) => (
        <>
          {chosen.length > 0 && (
            <div className="mb-1 flex flex-wrap gap-2">
              {chosen.map(({ value, name }) => (
                <RemovableChip key={value} removeLabel={removeLabel} onRemove={() => remove(value)}>
                  {name}
                </RemovableChip>
              ))}
            </div>
          )}
          <div>
            <Input
              {...control}
              ref={(element) => {
                inputRef.current = element;
                setRef(callerInputRef, element);
              }}
              role="combobox"
              aria-labelledby={labelId}
              aria-expanded={expanded}
              aria-controls={expanded ? listboxId : undefined}
              aria-activedescendant={expanded ? activeId : undefined}
              aria-autocomplete="list"
              autoComplete="off"
              placeholder={placeholder}
              value={search}
              onChange={type}
              onKeyDown={keyDown}
              onClick={() => setOpen(true)}
              onBlur={() => setOpen(false)}
            />
            {expanded && (
              <ul
                id={listboxId}
                // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: the ARIA listbox pattern, as on the fields board
                role="listbox"
                aria-labelledby={labelId}
                className="mt-2 flex max-h-72 flex-col gap-0.5 overflow-y-auto rounded-card border-2 border-field bg-surface p-1.5"
              >
                {options.map(({ value, name, hint }, index) => (
                  <li
                    key={value}
                    id={optionId(id, index)}
                    // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: the ARIA listbox pattern, as on the fields board
                    role="option"
                    aria-selected={index === activeIndex}
                    tabIndex={-1}
                    onMouseMove={() => setActive({ kind: 'option', value })}
                    onMouseDown={(event) => {
                      // Focus stays in the input, so its blur doesn't close the list before the pick.
                      event.preventDefault();
                      choose(value);
                    }}
                    className={optionClassName}
                  >
                    <OptionText name={name} hint={hint} search={search} />
                    {index === activeIndex && <ActiveMark />}
                  </li>
                ))}
                {addOption !== undefined && (
                  <li
                    id={addOptionId(id)}
                    // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: the ARIA listbox pattern, as on the fields board
                    role="option"
                    aria-selected={activeIndex === options.length}
                    tabIndex={-1}
                    onMouseMove={() => setActive({ kind: 'add' })}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      add();
                    }}
                    className={cn(optionClassName, options.length > 0 && 'relative mt-1.75')}
                  >
                    {/* Below matches, a hairline sets it apart; alone, it needs none. */}
                    {options.length > 0 && (
                      <span
                        aria-hidden="true"
                        className="absolute inset-x-3.5 -top-1.25 h-px bg-line forced-colors:bg-[CanvasText]"
                      />
                    )}
                    <span className="inline-flex items-center gap-2">
                      <Plus aria-hidden="true" strokeWidth={2.5} className="size-4.5 shrink-0" />
                      <span>
                        <Highlighted text={addOption.label} range={matchRange(addOption.label, search)} />
                      </span>
                    </span>
                    {activeIndex === options.length && <ActiveMark />}
                  </li>
                )}
              </ul>
            )}
            <div role="status">
              {open && itemCount === 0 && (
                <p className="mt-2 rounded-card border-2 border-field bg-surface px-3.5 py-3 text-muted">{emptyText}</p>
              )}
            </div>
          </div>
        </>
      )}
    </Field>
  );
};
