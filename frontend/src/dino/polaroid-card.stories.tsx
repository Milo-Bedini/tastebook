import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router';
import { expect, userEvent, within } from 'storybook/test';

import { FavouriteButton } from '@/dino/favourite-button';
import { PolaroidCard } from '@/dino/polaroid-card';
import { isHover, isPressed } from '@/dino/story-states';

const photoUrl =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='640' height='480'%3E%3Crect width='640' height='480' fill='%23e2583e'/%3E%3C/svg%3E";

const meta = {
  title: 'Dino/PolaroidCard',
  component: PolaroidCard,
  decorators: [
    (Story) => (
      <MemoryRouter>
        {/* A list polaroid's width on a phone, two a row; full width at large text. */}
        <div className="w-45 large-text:w-full">
          <Story />
        </div>
      </MemoryRouter>
    )
  ],
  args: {
    title: 'Bibimbap',
    to: '/recipes/bibimbap',
    recipeId: 3,
    photo: { thumbnails: [{ width: 640, url: photoUrl }] },
    lean: 'left',
    children: <p className="tabular-nums">35 min · Easy · Korean</p>
  }
} satisfies Meta<typeof PolaroidCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default = {
  play: async ({ canvasElement }) => {
    const link = within(canvasElement).getByRole('link', { name: 'Bibimbap' });
    await expect(link).toHaveAttribute('href', '/recipes/bibimbap');
    await expect(link).toHaveAccessibleDescription('35 min · Easy · Korean');
  }
} satisfies Story;
export const LeansRight = { args: { lean: 'right' } } satisfies Story;
export const IsHover = { parameters: isHover } satisfies Story;
export const IsPressed = { parameters: isPressed } satisfies Story;
export const IsFocus = { parameters: { pseudo: { focusVisible: ['a'] } } } satisfies Story;
export const PlaceSetting = { args: { photo: null, recipeId: 2, title: 'Shakshuka' } } satisfies Story;
export const Rug = { args: { photo: null, recipeId: 1, title: 'Ribollita' } } satisfies Story;
export const LongTitle = {
  args: { title: 'Slow-roasted pork shoulder with crackling, apple sauce and Yorkshire puddings' }
} satisfies Story;
export const LargeText = {} satisfies Story;

const heart = <FavouriteButton label="Favourite Bibimbap" saved onSavedChange={() => undefined} />;

export const WithAction = {
  args: { action: heart },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const link = canvas.getByRole('link', { name: 'Bibimbap' });
    await expect(link).toHaveAccessibleDescription('35 min · Easy · Korean');
    // The heart sits above the link's stretched target, so a press reaches it and not the link.
    const button = canvas.getByRole('button', { name: 'Favourite Bibimbap' });
    const { x, y, width, height } = button.getBoundingClientRect();
    await expect(document.elementFromPoint(x + width / 2, y + height / 2)?.closest('button')).toBe(button);
    // Focusing the heart rings the heart, not the card.
    await userEvent.tab();
    await userEvent.tab();
    await expect(button).toHaveFocus();
    await expect(getComputedStyle(canvasElement.querySelector('.group') as Element).outlineStyle).toBe('none');
  }
} satisfies Story;
export const WithActionAndLongMeta = {
  args: {
    action: heart,
    children: <p className="tabular-nums">1 hr 45 · Medium · Korean, Japanese and Chinese</p>
  }
} satisfies Story;
