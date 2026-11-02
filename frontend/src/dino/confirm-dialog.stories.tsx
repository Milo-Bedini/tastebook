import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';

import { Button } from '@/dino/button';
import { ConfirmDialog } from '@/dino/confirm-dialog';

const meta = {
  title: 'Dino/ConfirmDialog',
  component: ConfirmDialog,
  args: {
    trigger: <Button variant="danger">Delete recipe</Button>,
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
