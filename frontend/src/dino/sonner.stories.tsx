import type { Meta, StoryObj } from '@storybook/react-vite';
import { BookOpen, Library } from 'lucide-react';
import { MemoryRouter } from 'react-router';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { Button } from '@/dino/button';
import { Dock } from '@/dino/dock';
import { Toaster, toast } from '@/dino/sonner';

const showToast = (toasterId: string) =>
  toast('Saved to Favourites', {
    toasterId,
    action: { label: 'Undo', onClick: () => undefined },
    // Stays until dismissed, so the screenshot doesn't race Sonner's 4 s timer.
    duration: Number.POSITIVE_INFINITY
  });

const showError = (toasterId: string) =>
  toast.error('Couldn’t save. You’re offline.', {
    toasterId,
    action: { label: 'Try again', onClick: () => undefined },
    duration: Number.POSITIVE_INFINITY
  });

const meta = {
  title: 'Dino/Toast',
  component: Toaster,
  // Sonner replays every toast still showing to a newly mounted Toaster, so each story's Toaster shows only its own.
  render: (args, { id }) => (
    <>
      <Toaster {...args} id={id} />
      <div className="flex flex-wrap gap-2.5">
        <Button variant="secondary" onClick={() => showToast(id)}>
          Show a toast
        </Button>
        <Button variant="secondary" onClick={() => showError(id)}>
          Show an error
        </Button>
      </div>
    </>
  )
} satisfies Meta<typeof Toaster>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Show a toast' }));
    // The toast slides in, so it's visible once the animation has started.
    await waitFor(() => expect(canvas.getByText('Saved to Favourites')).toBeVisible());
    await expect(canvas.getByRole('button', { name: 'Undo' })).toBeVisible();
    await expect(canvas.getByText('Saved to Favourites').closest('[data-sonner-toast]')).toHaveStyle({
      transitionDuration: '0.15s',
      fontFamily: 'Nunito, ui-sans-serif, system-ui, sans-serif',
      backgroundColor: 'rgb(255, 244, 234)',
      borderTopWidth: '2px',
      borderTopColor: 'rgba(0, 0, 0, 0)'
    });
  }
} satisfies Story;
// Only the toast's action is forced, so the "Show a toast" button keeps its resting look.
export const IsHover = { ...Default, parameters: { pseudo: { hover: ['[data-button]'] } } } satisfies Story;
export const IsPressed = { ...Default, parameters: { pseudo: { active: ['[data-button]'] } } } satisfies Story;
export const IsFocus = { ...Default, parameters: { pseudo: { focusVisible: ['[data-button]'] } } } satisfies Story;
// Exported as Error under another name, since a binding called Error would shadow the global.
const ErrorStory = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Show an error' }));
    const message = canvas.getByText('Couldn’t save. You’re offline.');
    await waitFor(() => expect(message).toBeVisible());
    await expect(canvas.getByRole('button', { name: 'Try again' })).toBeVisible();
    const toastElement = message.closest('[data-sonner-toast]');
    await expect(toastElement?.querySelector('svg')).toBeInTheDocument();
    await expect(toastElement).toHaveStyle({ backgroundColor: 'rgb(255, 244, 234)' });
  }
} satisfies Story;

export { ErrorStory as Error };

// Under 640 px, beside the Dock: the toast clears the dock's 62 px and 20 px under it by 12 px.
export const AboveDock = {
  args: { aboveDock: true },
  parameters: {
    viewport: { options: { phone: { name: 'Phone', styles: { width: '390px', height: '844px' }, type: 'mobile' } } }
  },
  globals: { viewport: { value: 'phone' } },
  render: (args, { id }) => (
    <MemoryRouter>
      <Toaster {...args} id={id} />
      <Button variant="secondary" onClick={() => showToast(id)}>
        Show a toast
      </Button>
      <Dock
        tabs={[
          { to: '/', label: 'Recipes', icon: BookOpen },
          { to: '/lists', label: 'Lists', icon: Library }
        ]}
      />
    </MemoryRouter>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Show a toast' }));
    await waitFor(() => expect(canvas.getByText('Saved to Favourites')).toBeVisible());
    const dock = canvas.getByRole('navigation', { name: 'Main' }).getBoundingClientRect();
    const toaster = canvasElement.querySelector('[data-sonner-toaster]') as Element;
    // The toast's own box slides as it enters, so the stack's foot is what's measured.
    await expect(window.innerHeight - Number.parseFloat(getComputedStyle(toaster).bottom)).toBe(dock.top - 12);
  }
} satisfies Story;
