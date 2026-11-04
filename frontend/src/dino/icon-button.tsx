import { cva, type VariantProps } from 'class-variance-authority';
import type { LucideIcon } from 'lucide-react';
import type { ComponentProps, MouseEvent } from 'react';

import { cn } from '@/dino/cn';

const iconButtonVariants = cva(
  'inline-grid shrink-0 cursor-pointer place-items-center rounded-pill border-2 border-transparent bg-surface text-ink transition not-aria-disabled:hover:bg-line not-aria-disabled:active:scale-94 not-aria-disabled:active:bg-surface-pressed aria-pressed:bg-pink aria-pressed:text-on-pastel not-aria-disabled:aria-pressed:hover:bg-pink-hover not-aria-disabled:aria-pressed:active:bg-pink-pressed aria-disabled:cursor-not-allowed aria-disabled:border-dashed aria-disabled:border-field aria-disabled:bg-surface aria-disabled:text-muted',
  {
    variants: { size: { default: 'size-11', large: 'size-12' } },
    defaultVariants: { size: 'default' }
  }
);

// label is required, so an icon-only button without an accessible name doesn't compile.
type IconButtonProps = {
  icon: LucideIcon;
  label: string;
  pressed?: boolean;
  disabled?: boolean;
} & VariantProps<typeof iconButtonVariants> &
  Omit<ComponentProps<'button'>, 'children' | 'aria-label' | 'aria-pressed' | 'disabled'>;

export const IconButton = ({
  icon: Icon,
  label,
  pressed,
  disabled,
  size,
  className,
  onClick,
  ...props
}: IconButtonProps) => {
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    // preventDefault also stops a disabled submit button submitting its form.
    if (disabled) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };

  return (
    <button
      type="button"
      {...props}
      aria-label={label}
      aria-pressed={pressed}
      aria-disabled={disabled || undefined}
      className={cn(iconButtonVariants({ size }), className)}
      onClick={handleClick}
    >
      <Icon aria-hidden="true" strokeWidth={pressed ? 2 : 2.5} className={cn('size-5', pressed && 'fill-current')} />
    </button>
  );
};
