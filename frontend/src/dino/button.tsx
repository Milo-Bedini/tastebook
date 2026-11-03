import { cva, type VariantProps } from 'class-variance-authority';
import { Info } from 'lucide-react';
import { Slot } from 'radix-ui';
import { type ComponentProps, type MouseEvent, useId } from 'react';

import { cn } from '@/dino/cn';
import { Spinner } from '@/dino/spinner';

const buttonVariants = cva(
  'inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-pill border-2 border-transparent no-underline transition aria-disabled:cursor-not-allowed aria-busy:cursor-progress aria-disabled:not-aria-busy:border-dashed aria-disabled:not-aria-busy:border-field aria-disabled:not-aria-busy:bg-surface aria-disabled:not-aria-busy:text-muted aria-disabled:not-aria-busy:shadow-none [&_svg]:pointer-events-none [&_svg]:size-4.5 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary:
          'bg-peach text-on-pastel shadow-press not-aria-disabled:hover:bg-peach-hover not-aria-disabled:active:translate-y-0.75 not-aria-disabled:active:bg-peach-pressed not-aria-disabled:active:shadow-press-sunk',
        secondary:
          'border-field bg-transparent text-ink not-aria-disabled:hover:border-ink not-aria-disabled:hover:bg-surface not-aria-disabled:active:scale-97 not-aria-disabled:active:border-ink not-aria-disabled:active:bg-line',
        ghost:
          'bg-transparent text-ink not-aria-disabled:hover:bg-surface not-aria-disabled:active:scale-97 not-aria-disabled:active:bg-line',
        danger:
          'bg-danger text-on-danger not-aria-disabled:hover:bg-danger-hover not-aria-disabled:active:scale-97 not-aria-disabled:active:bg-danger-pressed'
      },
      size: {
        default: 'h-11 px-5 text-label',
        large: 'h-16 px-7 text-label-l'
      }
    },
    defaultVariants: { variant: 'primary', size: 'default' }
  }
);

// A disabled button must say why (docs/design.md, States › Disabled), so the reason is required with it.
type DisabledProps =
  | { disabled?: undefined; disabledReason?: undefined }
  | { disabled: boolean; disabledReason: string };

// A loading button shows its "-ing" label ("Saving…"), so the label is required with it.
type LoadingProps = { loading?: undefined; loadingLabel?: undefined } | { loading: boolean; loadingLabel: string };

type ButtonBaseProps = Omit<ComponentProps<'button'>, 'disabled'> & VariantProps<typeof buttonVariants>;

// asChild renders a link styled as a button; a link can't be disabled or loading.
type ButtonProps = ButtonBaseProps &
  (
    | ({ asChild?: false } & DisabledProps & LoadingProps)
    | { asChild: true; disabled?: undefined; disabledReason?: undefined; loading?: undefined; loadingLabel?: undefined }
  );

const layer = 'col-start-1 row-start-1 inline-flex items-center justify-center gap-2';

export const Button = (props: ButtonProps) => {
  const reasonId = useId();

  if (props.asChild) {
    const { asChild, variant, size, className, ...rest } = props;
    return <Slot.Root className={cn(buttonVariants({ variant, size }), className)} {...rest} />;
  }

  const {
    asChild,
    variant,
    size,
    className,
    type = 'button',
    disabled,
    disabledReason,
    loading,
    loadingLabel,
    onClick,
    children,
    'aria-describedby': describedBy,
    ...rest
  } = props;
  const isInert = disabled === true || loading === true;
  const showsReason = disabled === true && loading !== true;
  const describedByIds = [describedBy, showsReason ? reasonId : undefined].filter(Boolean).join(' ');

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    // preventDefault also stops a disabled submit button submitting its form.
    if (isInert) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };

  return (
    <>
      <button
        {...rest}
        type={type}
        aria-disabled={isInert || undefined}
        aria-busy={loading || undefined}
        aria-describedby={describedByIds || undefined}
        className={cn(buttonVariants({ variant, size }), className)}
        onClick={handleClick}
      >
        {loadingLabel === undefined ? (
          children
        ) : (
          <span className="grid">
            <span aria-hidden={loading || undefined} className={cn(layer, loading && 'invisible')}>
              {children}
            </span>
            <span aria-hidden={!loading || undefined} className={cn(layer, !loading && 'invisible')}>
              <Spinner />
              {loadingLabel}
            </span>
          </span>
        )}
      </button>
      {showsReason && (
        <p id={reasonId} className="flex items-start gap-2 text-small text-muted">
          <Info aria-hidden="true" className="mt-px size-4 shrink-0" />
          {disabledReason}
        </p>
      )}
    </>
  );
};
