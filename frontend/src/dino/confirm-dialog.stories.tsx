import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';

import { Button } from '@/dino/button';
import { ConfirmDialog } from '@/dino/confirm-dialog';
import { Field } from '@/dino/field';
import { Input } from '@/dino/input';
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
  render: ({ pending = false, onConfirm = () => {} }) => {
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
  render: ({ pending = false, onConfirm = () => {} }) => {
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

const deleting = { title: 'Delete your account?' } as const;

const everyLine = [
  'Your name, email address, Favourites and personal lists will be deleted, and you’ll be signed out everywhere.',
  'The 12 private recipes you wrote will be deleted. Leave your household first if you want it to keep them.',
  'Nightly backups keep a copy for up to 30 days.'
];

const sendCode = { pending: false, pendingLabel: 'Sending…', confirmLabel: 'Send code', tone: 'primary' } as const;

// The stories below hold their dialog open themselves, so these stand in for the caller.
const confirmed = fn();
const retried = fn(async () => {});

// Opens already open and stays so, as a page holds it open across its steps.
const opened = async (canvasElement: HTMLElement) => {
  const body = within(canvasElement.ownerDocument.body);
  const dialog = await body.findByRole('alertdialog', { name: 'Delete your account?' });
  // It fades in, so it's visible once the animation has started.
  await waitFor(() => expect(dialog).toBeVisible());
  return dialog;
};

// Several lines of description, one paragraph each, all of them the dialog's description.
export const Lines = {
  render: () => {
    const [open, setOpen] = useState(true);
    return (
      <ConfirmDialog
        {...deleting}
        {...sendCode}
        description={everyLine}
        open={open}
        onOpenChange={setOpen}
        onConfirm={confirmed}
      />
    );
  },
  play: async ({ canvasElement }) => {
    const dialog = await opened(canvasElement);

    await expect(dialog).toHaveAccessibleDescription(everyLine.join(' '));
    await expect(
      within(dialog)
        .getAllByRole('paragraph')
        .map((line) => line.textContent)
    ).toEqual(everyLine);
    await expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    // A step before the action is primary: peach, not danger's coral.
    await expect(within(dialog).getByRole('button', { name: 'Send code' })).toHaveStyle({
      backgroundColor: 'rgb(255, 179, 138)'
    });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send code' }));
    await expect(confirmed).toHaveBeenCalledOnce();
  }
} satisfies Story;

// What the action needs first, between the description and the buttons; the confirm shows its request.
export const WithContent = {
  render: () => {
    const [open, setOpen] = useState(true);
    return (
      <ConfirmDialog
        {...deleting}
        description={[
          <>
            We sent a 6-digit code to{' '}
            <b className="font-extrabold text-ink [overflow-wrap:anywhere]">sam@example.com</b>. It works for 10
            minutes.
          </>
        ]}
        pending
        pendingLabel="Deleting…"
        confirmLabel="Delete account"
        open={open}
        onOpenChange={setOpen}
        onConfirm={confirmed}
      >
        <Field label="Code" error="Enter the 6-digit code from the email, like 123456.">
          {(control) => <Input {...control} inputMode="numeric" maxLength={6} defaultValue="12345" />}
        </Field>
        <div>
          <Button variant="secondary">Send a new code</Button>
        </div>
      </ConfirmDialog>
    );
  },
  play: async ({ canvasElement }) => {
    const dialog = await opened(canvasElement);
    const code = within(dialog).getByRole('textbox', { name: 'Code' });

    await expect(dialog).toHaveAccessibleDescription(
      'We sent a 6-digit code to sam@example.com. It works for 10 minutes.'
    );
    await expect(code).toHaveAccessibleDescription('Enter the 6-digit code from the email, like 123456.');
    const buttons = within(dialog).getAllByRole('button');
    await expect(buttons).toHaveLength(3);
    await expect(buttons[0]).toHaveAccessibleName('Send a new code');
    await expect(buttons[1]).toHaveAccessibleName('Cancel');
    await expect(buttons[2]).toHaveAccessibleName('Deleting…');
    const confirm = within(dialog).getByRole('button', { name: 'Deleting…' });
    await expect(confirm).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(confirm);
    await expect(confirmed).not.toHaveBeenCalled();
  }
} satisfies Story;

// Why the action can't go ahead, when no field holds it: over the buttons, announced.
export const WithError = {
  render: () => {
    const [open, setOpen] = useState(true);
    return (
      <ConfirmDialog
        {...deleting}
        {...sendCode}
        description={[everyLine[0], everyLine[2]]}
        error="You’ve asked for too many codes. Try again in 7 minutes."
        open={open}
        onOpenChange={setOpen}
        onConfirm={confirmed}
      />
    );
  },
  play: async ({ canvasElement }) => {
    const dialog = await opened(canvasElement);

    await expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'You’ve asked for too many codes. Try again in 7 minutes.'
    );
    await expect(within(dialog).getByRole('button', { name: 'Send code' })).toBeVisible();
  }
} satisfies Story;

// While what it says loads there's no confirm, and focus stays on Cancel.
export const Loading = {
  render: () => {
    const [open, setOpen] = useState(true);
    return (
      <ConfirmDialog
        {...deleting}
        {...sendCode}
        status="loading"
        loadingLabel="Checking what deleting removes…"
        open={open}
        onOpenChange={setOpen}
        onConfirm={confirmed}
      />
    );
  },
  play: async ({ canvasElement }) => {
    const dialog = await opened(canvasElement);

    // Loading shows its line after half a second.
    await waitFor(() => expect(within(dialog).getByRole('status')).toBeVisible());
    await expect(within(dialog).getByRole('status')).toHaveTextContent('Checking what deleting removes…');
    await expect(
      within(dialog)
        .getAllByRole('button')
        .map((button) => button.textContent)
    ).toEqual(['Cancel']);
    await expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
  }
} satisfies Story;

// What it says couldn't load: a retry in the body, and no confirm.
export const Failed = {
  render: () => {
    const [open, setOpen] = useState(true);
    return (
      <ConfirmDialog
        {...deleting}
        {...sendCode}
        status="error"
        errorTitle="Couldn’t reach Tastebook"
        errorText="Check your connection and try again."
        onRetry={retried}
        open={open}
        onOpenChange={setOpen}
        onConfirm={confirmed}
      />
    );
  },
  play: async ({ canvasElement }) => {
    const dialog = await opened(canvasElement);

    await expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'Couldn’t reach TastebookCheck your connection and try again.'
    );
    await expect(within(dialog).queryByRole('button', { name: 'Send code' })).not.toBeInTheDocument();
    await expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Try again' }));
    await expect(retried).toHaveBeenCalledOnce();
  }
} satisfies Story;

// It can only explain: its one button is the way out, "Close".
export const Notice = {
  render: () => {
    const [open, setOpen] = useState(true);
    return (
      <ConfirmDialog
        {...deleting}
        notice
        description="Staff accounts can’t be deleted here. Ask another staff member to take your staff access away first."
        open={open}
        onOpenChange={setOpen}
      />
    );
  },
  play: async ({ canvasElement }) => {
    const dialog = await opened(canvasElement);

    await expect(
      within(dialog)
        .getAllByRole('button')
        .map((button) => button.textContent)
    ).toEqual(['Close']);
    await expect(within(dialog).getByRole('button', { name: 'Close' })).toHaveFocus();
  }
} satisfies Story;
