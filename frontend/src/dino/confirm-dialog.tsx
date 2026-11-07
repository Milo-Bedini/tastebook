import { AlertDialog } from 'radix-ui';
import { type ComponentProps, cloneElement, type ReactElement, useRef } from 'react';

import { AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from '@/dino/alert-dialog';
import { Button } from '@/dino/button';

type BaseProps = {
  // The confirm sends a request, so the trigger shows it while it runs with an "-ing" label ("Removing…").
  pending: boolean;
  pendingLabel: string;
  title: string;
  description: string;
  confirmLabel: string;
  // Names what the way out keeps when the action is itself a cancel ("Keep link" beside "Cancel link").
  cancelLabel?: string;
  // Primary only for a change that can be undone (docs/design.md, Dialog); anything final stays danger.
  tone?: 'danger' | 'primary';
  onConfirm: () => void;
};

// Opened by its own trigger, or by something else (a switch) that holds `open`: never both.
type OpenProps =
  | { trigger: ReactElement<ComponentProps<typeof Button>>; open?: never; onOpenChange?: never }
  | { trigger?: never; open: boolean; onOpenChange: (open: boolean) => void };

type ConfirmDialogProps = BaseProps & OpenProps;

export const ConfirmDialog = ({
  trigger,
  open,
  onOpenChange,
  pending,
  pendingLabel,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'danger',
  onConfirm
}: ConfirmDialogProps) => {
  // With no trigger of its own, focus goes back to whatever had it when the dialog opened.
  const opener = useRef<HTMLElement | null>(null);
  const isControlled = trigger === undefined;

  const rememberOpener = () => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  };
  const returnFocus = (event: Event) => {
    event.preventDefault();
    if (opener.current?.isConnected) {
      opener.current.focus();
    }
  };

  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      {trigger !== undefined && (
        <AlertDialog.Trigger asChild>
          {cloneElement(trigger, { loading: pending, loadingLabel: pendingLabel })}
        </AlertDialog.Trigger>
      )}
      <AlertDialogContent
        onOpenAutoFocus={isControlled ? rememberOpener : undefined}
        onCloseAutoFocus={isControlled ? returnFocus : undefined}
      >
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
        <div className="mt-2 flex flex-wrap justify-end gap-2.5">
          <AlertDialog.Cancel asChild>
            <Button variant="secondary">{cancelLabel}</Button>
          </AlertDialog.Cancel>
          {isControlled ? (
            // There's no trigger to show the request, so the confirm does, and the caller closes the dialog once
            // it has answered.
            <Button variant={tone} loading={pending} loadingLabel={pendingLabel} onClick={onConfirm}>
              {confirmLabel}
            </Button>
          ) : (
            <AlertDialog.Action asChild>
              <Button variant={tone} onClick={onConfirm}>
                {confirmLabel}
              </Button>
            </AlertDialog.Action>
          )}
        </div>
      </AlertDialogContent>
    </AlertDialog.Root>
  );
};
