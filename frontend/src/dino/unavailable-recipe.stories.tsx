import type { Meta, StoryObj } from '@storybook/react-vite';
import { Heart } from 'lucide-react';
import { expect, within } from 'storybook/test';

import { IconButton } from '@/dino/icon-button';
import { UnavailableRecipe } from '@/dino/unavailable-recipe';

// The FavouriteButton (TAS-123) doesn't exist yet, so the heart is the pressed icon button it's built on.
const heart = (title: string) => <IconButton icon={Heart} label={`Favourite ${title}`} pressed />;

const meta = {
  title: 'Dino/UnavailableRecipe',
  component: UnavailableRecipe,
  decorators: [
    (Story, { parameters }) => (
      // A list polaroid's width: two a row on a phone (full width at large text), or four on a laptop.
      <ul className={parameters.laptop ? 'w-71.5' : 'w-41.75 large-text:w-full'}>
        <Story />
      </ul>
    )
  ],
  args: { title: 'Grandma’s curry', action: heart('Grandma’s curry') }
} satisfies Meta<typeof UnavailableRecipe>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const item = canvas.getByRole('listitem');
    await expect(within(item).getByRole('heading', { level: 2, name: 'Grandma’s curry' })).toBeVisible();
    // The box's words are hidden and said with the meta, after the title.
    await expect(within(item).getByText('No longer available').closest('[aria-hidden="true"]')).not.toBeNull();
    await expect(within(item).getByText('Made private or deleted')).toHaveTextContent(
      'No longer available. Made private or deleted'
    );
    await expect(within(item).getByRole('button', { name: 'Favourite Grandma’s curry' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    // Nothing to open: the heart is its only control.
    await expect(within(item).queryByRole('link')).toBeNull();
  }
} satisfies Story;
export const HeartIsHover = { parameters: { pseudo: { hover: ['button'] } } } satisfies Story;
export const HeartIsFocus = { parameters: { pseudo: { focusVisible: ['button'] } } } satisfies Story;
export const LongTitle = {
  args: { title: 'Slow-roast lamb shoulder with anchovy', action: heart('Slow-roast lamb shoulder with anchovy') }
} satisfies Story;
export const LaptopGrid = { parameters: { laptop: true } } satisfies Story;
export const LargeText = {} satisfies Story;
