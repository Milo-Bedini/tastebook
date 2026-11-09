import { Search, X } from 'lucide-react';
import { type ComponentProps, useRef } from 'react';

import { cn } from '@/dino/cn';
import { fieldControlStates, isAriaDisabled } from '@/dino/field-control';

// Disabled is aria-disabled, never disabled, so the field stays focusable (docs/design.md, States).
type InputProps = Omit<ComponentProps<'input'>, 'disabled'>;

export const Input = ({ className, type = 'text', readOnly, ...props }: InputProps) => (
  <input
    type={type}
    readOnly={readOnly || isAriaDisabled(props['aria-disabled'])}
    className={cn(
      'h-12 w-full min-w-0 rounded-pill border-2 border-field bg-transparent px-4.5 font-bold text-body text-ink transition-colors placeholder:font-semibold placeholder:text-muted',
      ...fieldControlStates,
      className
    )}
    {...props}
  />
);

// The label is usually hidden, so the placeholder is the only text the empty field shows.
type SearchInputProps = Omit<InputProps, 'type' | 'value' | 'onChange' | 'placeholder'> & {
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
};

export const SearchInput = ({ className, value, onValueChange, ...props }: SearchInputProps) => {
  const input = useRef<HTMLInputElement>(null);
  const hasValue = value !== '';
  const canClear = hasValue && !isAriaDisabled(props['aria-disabled']);

  const clear = () => {
    onValueChange('');
    input.current?.focus();
  };

  return (
    <div className="group relative">
      <Search
        aria-hidden="true"
        strokeWidth={2.5}
        className="pointer-events-none absolute top-3.5 left-4 size-5 text-muted group-focus-within:text-ink forced-colors:text-current"
      />
      <Input
        ref={input}
        type="search"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        className={cn('pl-11.5 [&::-webkit-search-cancel-button]:appearance-none', hasValue && 'pr-12.5', className)}
        {...props}
      />
      {canClear && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={clear}
          className="absolute top-0.5 right-0.5 flex size-11 cursor-pointer items-center justify-center rounded-pill bg-transparent text-ink hover:text-muted"
        >
          <X aria-hidden="true" strokeWidth={2.5} className="size-4.5" />
        </button>
      )}
    </div>
  );
};
