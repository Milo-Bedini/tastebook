import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';

import { Spinner } from '@/dino/spinner';

const meta = {
  title: 'Dino/Spinner',
  component: Spinner,
  args: { className: 'size-4.5' }
} satisfies Meta<typeof Spinner>;

export default meta;

type Story = StoryObj<typeof meta>;

// Beside the line that says what's working, as a chip group shows while its chips load.
export const BesideALine = {
  render: (args) => (
    <p role="status" className="flex items-center gap-2.5 text-label">
      <Spinner {...args} />
      Loading cuisines…
    </p>
  ),
  play: async ({ canvasElement }) => {
    const status = within(canvasElement).getByRole('status');
    await expect(status).toHaveTextContent('Loading cuisines…');
    await expect(status.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  }
} satisfies Story;
