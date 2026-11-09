import { CircleAlert } from 'lucide-react';
import { AlertDialog } from 'radix-ui';
import { Children, type ComponentProps, cloneElement, type ReactElement, type ReactNode, useRef } from 'react';

import { AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from '@/dino/alert-dialog';
import { Button } from '@/dino/button';
import { ErrorWithRetry } from '@/dino/error-with-retry';
import { Loading } from '@/dino/loading';

type BaseProps = {
  title: string;
  // Between the description and the buttons: what the action needs first, like a Code field.
  children?: ReactNode;
  // Why the action can't go ahead, when no field holds it.
  error?: string;
  // Names what the way out keeps when the action is itself a cancel ("Keep link" beside "Cancel link"); "Close" in a
  // notice, as nothing is being cancelled.
  cancelLabel?: string;
};

// What the dialog says. While what it needs to say loads, or after that failed, it has no confirm. A step is a
// re-render under the same title.
type StatusProps =
  // A string, or lines: one paragraph each.
  | { status?: 'ready'; description: string | readonly ReactNode[] }
  | { status: 'loading'; loadingLabel: string; description?: never }
  | {
      status: 'error';
      errorTitle: string;
      errorText: string;
      onRetry: () => Promise<unknown>;
      description?: never;
    };

type ConfirmProps =
  | {
      notice?: false;
      // The confirm sends a request, so the trigger shows it while it runs with an "-ing" label ("Removing…").
      pending: boolean;
      pendingLabel: string;
      confirmLabel: string;
      // Primary for a change that can be undone, or a step before the action (docs/design.md, Dialog); anything
      // final stays danger.
      tone?: 'danger' | 'primary';
      onConfirm: () => void;
    }
  // Only explains: the way out is its one button.
  | {
      notice: true;
      pending?: never;
      pendingLabel?: never;
      confirmLabel?: never;
      tone?: never;
      onConfirm?: never;
    };

// Opened by its own trigger, or by something else (a switch) that holds `open`: never both.
type OpenProps =
  | { trigger: ReactElement<ComponentProps<typeof Button>>; open?: never; onOpenChange?: never }
  | { trigger?: never; open: boolean; onOpenChange: (open: boolean) => void };

type ConfirmDialogProps = BaseProps & StatusProps & ConfirmProps & OpenProps;

const Description = ({ description }: { description: string | readonly ReactNode[] }) =>
  typeof description === 'string' ? (
    <AlertDialogDescription>{description}</AlertDialogDescription>
  ) : (
    <AlertDialogDescription asChild>
      <div className="flex flex-col gap-2">
        {Children.map(description, (line) => (
          <p>{line}</p>
        ))}
      </div>
    </AlertDialogDescription>
  );

const Body = (props: StatusProps) => {
  if (props.status === 'loading') {
    return <Loading>{props.loadingLabel}</Loading>;
  }
  if (props.status === 'error') {
    return (
      <ErrorWithRetry title={props.errorTitle} onRetry={props.onRetry}>
        {props.errorText}
      </ErrorWithRetry>
    );
  }
  return <Description description={props.description} />;
};

export const ConfirmDialog = (props: ConfirmDialogProps) => {
  const { trigger, open, onOpenChange, title, children, error, notice } = props;
  const { cancelLabel = notice ? 'Close' : 'Cancel' } = props;
  // With no trigger of its own, focus goes back to whatever had it when the dialog opened.
  const opener = useRef<HTMLElement | null>(null);
  const isControlled = trigger === undefined;
  const isReady = props.status === undefined || props.status === 'ready';

  const rememberOpener = () => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  };
  const returnFocus = (event: Event) => {
    event.preventDefault();
    if (opener.current?.isConnected) {
      opener.current.focus();
    }
  };

  const confirm = () => {
    if (props.notice || !isReady) {
      return undefined;
    }
    const { pending, pendingLabel, confirmLabel, tone = 'danger', onConfirm } = props;
    // There's no trigger to show the request, so the confirm does, and the caller closes the dialog once it has
    // answered.
    return isControlled ? (
      <Button variant={tone} loading={pending} loadingLabel={pendingLabel} onClick={onConfirm}>
        {confirmLabel}
      </Button>
    ) : (
      <AlertDialog.Action asChild>
        <Button variant={tone} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </AlertDialog.Action>
    );
  };

  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      {trigger !== undefined && (
        <AlertDialog.Trigger asChild>
          {props.notice ? trigger : cloneElement(trigger, { loading: props.pending, loadingLabel: props.pendingLabel })}
        </AlertDialog.Trigger>
      )}
      <AlertDialogContent
        // Loading or failed, the dialog has no description yet.
        {...(isReady ? {} : { 'aria-describedby': undefined })}
        onOpenAutoFocus={isControlled ? rememberOpener : undefined}
        onCloseAutoFocus={isControlled ? returnFocus : undefined}
      >
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <Body {...props} />
        {isReady && children}
        {isReady && error !== undefined && (
          <p role="alert" className="flex items-start gap-1.5 text-danger text-small">
            <CircleAlert aria-hidden="true" className="mt-px size-4 shrink-0" strokeWidth={2.5} />
            {error}
          </p>
        )}
        <div className="mt-2 flex flex-wrap justify-end gap-2.5">
          <AlertDialog.Cancel asChild>
            <Button variant="secondary">{cancelLabel}</Button>
          </AlertDialog.Cancel>
          {confirm()}
        </div>
      </AlertDialogContent>
    </AlertDialog.Root>
  );
};
