import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';

import { Button } from '@/dino/button';
import { ConfirmDialog } from '@/dino/confirm-dialog';
import { Switch } from '@/dino/switch';

const meta = {
  title: 'Dino/ConfirmDialog',
  component: ConfirmDialog,
  args: {
    trigger: <Button variant="danger">Delete recipe</Button>,
    pending: false,
    pendingLabel: 'Deleting…',
    title: 'Delete this recipe?',
    description:
      'Chana masala and its 2 notes will be deleted for everyone in your household. The 6 things it put on the shopping list stay.',
    confirmLabel: 'Delete recipe',
    onConfirm: fn()
  }
} satisfies Meta<typeof ConfirmDialog>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default = {} satisfies Story;
export const Open = {
  play: async ({ canvasElement }) => {
    // The dialog is portalled to the body, outside the story's canvas.
    const body = within(canvasElement.ownerDocument.body);
    const trigger = within(canvasElement).getByRole('button', { name: 'Delete recipe' });

    await userEvent.click(trigger);
    const dialog = body.getByRole('alertdialog', { name: 'Delete this recipe?' });
    // It fades in, so it's visible once the animation has started.
    await waitFor(() => expect(dialog).toBeVisible());
    await expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await expect(dialog).toHaveStyle({ borderTopWidth: '2px', borderTopColor: 'rgba(0, 0, 0, 0)' });
    await expect(within(dialog).getByRole('heading', { name: 'Delete this recipe?' })).toHaveStyle({
      fontSize: '34px'
    });

    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(body.queryByRole('alertdialog')).not.toBeInTheDocument());
    await expect(trigger).toHaveFocus();

    // Opened again, so the story ends on the open dialog for axe and the 44 px check.
    await userEvent.click(trigger);
    const reopened = body.getByRole('alertdialog', { name: 'Delete this recipe?' });
    await waitFor(() => expect(reopened).toBeVisible());
  }
} satisfies Story;

export const KeepLabel = {
  args: {
    trigger: <Button variant="ghost">Cancel link</Button>,
    pendingLabel: 'Cancelling…',
    title: 'Cancel this invite link?',
    description: 'Anyone who opens it will be told it no longer works. You can make a new link afterwards.',
    confirmLabel: 'Cancel link',
    cancelLabel: 'Keep link'
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Cancel link' }));
    const dialog = body.getByRole('alertdialog', { name: 'Cancel this invite link?' });
    await waitFor(() => expect(dialog).toBeVisible());
    const buttons = within(dialog).getAllByRole('button');

    await expect(buttons.map((button) => button.textContent)).toEqual(['Keep link', 'Cancel link']);
    await expect(within(dialog).getByRole('button', { name: 'Keep link' })).toHaveFocus();
  }
} satisfies Story;

export const Pending = {
  args: { pending: true },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const trigger = within(canvasElement).getByRole('button', { name: 'Deleting…' });

    await expect(trigger).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(trigger);
    await expect(body.queryByRole('alertdialog')).not.toBeInTheDocument();
  }
} satisfies Story;

const publishing = {
  pendingLabel: 'Making public…',
  title: 'Make this recipe public?',
  description:
    'Anyone can find Grandma’s curry, credited “by Sam”, and only you will be able to edit it. You can make it private again.',
  confirmLabel: 'Make public',
  tone: 'primary'
} as const;

// Opened by a switch rather than a trigger of its own, as the recipe page's Public switch opens it.
export const PrimaryTone = {
  args: { ...publishing, pending: false },
  render: ({ pending, onConfirm }) => {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Switch checked={false} onCheckedChange={setOpen}>
          Public
        </Switch>
        <ConfirmDialog {...publishing} open={open} onOpenChange={setOpen} pending={pending} onConfirm={onConfirm} />
      </>
    );
  },
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const control = within(canvasElement).getByRole('switch', { name: 'Public' });

    await userEvent.click(control);
    const dialog = body.getByRole('alertdialog', { name: 'Make this recipe public?' });
    await waitFor(() => expect(dialog).toBeVisible());
    await expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    // The primary button's peach, not danger's.
    await expect(within(dialog).getByRole('button', { name: 'Make public' })).toHaveStyle({
      backgroundColor: 'rgb(255, 179, 138)'
    });

    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(body.queryByRole('alertdialog')).not.toBeInTheDocument());
    await expect(control).toHaveFocus();
    await expect(args.onConfirm).not.toHaveBeenCalled();

    // Opened again, so the story ends on the open dialog for axe and the 44 px check.
    await userEvent.click(control);
    const reopened = body.getByRole('alertdialog', { name: 'Make this recipe public?' });
    await waitFor(() => expect(reopened).toBeVisible());
  }
} satisfies Story;

export const Controlled = {
  args: { ...publishing, pending: true },
  render: ({ pending, onConfirm }) => {
    const [open, setOpen] = useState(true);
    return <ConfirmDialog {...publishing} open={open} onOpenChange={setOpen} pending={pending} onConfirm={onConfirm} />;
  },
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = await body.findByRole('alertdialog', { name: 'Make this recipe public?' });
    const confirm = within(dialog).getByRole('button', { name: 'Making public…' });
    // It fades in, so it's visible once the animation has started.
    await waitFor(() => expect(dialog).toBeVisible());

    await expect(confirm).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(confirm);
    await expect(args.onConfirm).not.toHaveBeenCalled();
    await expect(dialog).toBeVisible();
  }
} satisfies Story;
