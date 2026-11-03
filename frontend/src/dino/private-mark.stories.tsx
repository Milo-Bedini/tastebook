import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router';
import { expect, within } from 'storybook/test';

import { PolaroidCard } from '@/dino/polaroid-card';
import { PrivateMark } from '@/dino/private-mark';
import { Squiggle } from '@/dino/squiggle';

const meta = {
  title: 'Dino/PrivateMark',
  component: PrivateMark
} satisfies Meta<typeof PrivateMark>;

export default meta;

type Story = StoryObj<typeof meta>;

export const OnGround = {
  play: async ({ canvasElement }) => {
    const mark = within(canvasElement).getByText('Private');
    await expect(mark).toBeVisible();
    // The word says it; the lock stays out of the accessibility tree.
    await expect(mark.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  }
} satisfies Story;

export const OnACard = {
  render: () => (
    <MemoryRouter>
      <div className="w-42.5 large-text:w-full">
        <PolaroidCard title="Grandma’s curry" to="/recipes/grandmas-curry" recipeId={101} photo={null} lean="left">
          <span className="mb-1 block">
            <PrivateMark />
          </span>
          <p>40 min · Easy · Indian</p>
        </PolaroidCard>
      </div>
    </MemoryRouter>
  ),
  play: async ({ canvasElement }) => {
    const link = within(canvasElement).getByRole('link', { name: 'Grandma’s curry' });
    await expect(link).toHaveAccessibleDescription('Private 40 min · Easy · Indian');
  }
} satisfies Story;

export const UnderATitle = {
  render: () => (
    <div className="flex flex-col gap-4">
      <h1>
        <Squiggle>Grandma’s</Squiggle> curry
      </h1>
      <PrivateMark />
      <p className="text-muted">Mild, with potatoes and peas. Better the next day.</p>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { level: 1, name: 'Grandma’s curry' })).toBeVisible();
    await expect(canvas.getByText('Private')).toBeVisible();
  }
} satisfies Story;

export const LargeText = {
  render: () => (
    <div className="flex flex-col items-start gap-2">
      <PrivateMark />
      <p className="text-muted text-small">40 min · Easy · Indian</p>
    </div>
  )
} satisfies Story;
