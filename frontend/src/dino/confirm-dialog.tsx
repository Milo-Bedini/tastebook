import { AlertDialog } from 'radix-ui';
import type { ReactElement } from 'react';

import { AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from '@/dino/alert-dialog';
import { Button } from '@/dino/button';

type ConfirmDialogProps = {
  trigger: ReactElement;
  title: string;
  description: string;
  confirmLabel: string;
  // Names what the way out keeps when the action is itself a cancel ("Keep link" beside "Cancel link").
  cancelLabel?: string;
  onConfirm: () => void;
};

export const ConfirmDialog = ({
  trigger,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm
}: ConfirmDialogProps) => (
  <AlertDialog.Root>
    <AlertDialog.Trigger asChild>{trigger}</AlertDialog.Trigger>
    <AlertDialogContent>
      <AlertDialogTitle>{title}</AlertDialogTitle>
      <AlertDialogDescription>{description}</AlertDialogDescription>
      <div className="mt-2 flex flex-wrap justify-end gap-2.5">
        <AlertDialog.Cancel asChild>
          <Button variant="secondary">{cancelLabel}</Button>
        </AlertDialog.Cancel>
        <AlertDialog.Action asChild>
          <Button variant="danger" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </AlertDialog.Action>
      </div>
    </AlertDialogContent>
  </AlertDialog.Root>
);
