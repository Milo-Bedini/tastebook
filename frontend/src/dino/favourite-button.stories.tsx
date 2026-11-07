import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';

import { FavouriteButton } from '@/dino/favourite-button';
import { isHover, isPressed } from '@/dino/story-states';

// The button alone, so the forced ring isn't drawn round the heart too.
const isFocus = { pseudo: { focusVisible: ['button'] } };

const meta = {
  title: 'Dino/FavouriteButton',
  component: FavouriteButton,
  args: { label: 'Favourite', saved: false, onSavedChange: fn() }
} satisfies Meta<typeof FavouriteButton>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default = {
  render: (args) => {
    const [saved, setSaved] = useState(args.saved);
    return (
      <FavouriteButton
        {...args}
        saved={saved}
        onSavedChange={(next) => {
          args.onSavedChange(next);
          setSaved(next);
        }}
      />
    );
  },
  play: async ({ args, canvasElement }) => {
    const button = within(canvasElement).getByRole('button', { name: 'Favourite' });
    const icon = () => button.querySelector('svg') as SVGElement;
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    await expect(getComputedStyle(icon()).fill).toBe('none');
    await expect(icon()).toHaveAttribute('stroke-width', '2.5');

    await userEvent.click(button);
    await expect(args.onSavedChange).toHaveBeenLastCalledWith(true);
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(icon()).toHaveAttribute('stroke-width', '2');
    // Filled in the button's own colour, so forced colours redraws it too.
    await expect(getComputedStyle(icon()).fill).toBe(getComputedStyle(button).color);

    await userEvent.click(button);
    await expect(args.onSavedChange).toHaveBeenLastCalledWith(false);
    await expect(button).toHaveAttribute('aria-pressed', 'false');
  }
} satisfies Story;
export const IsHover = { parameters: isHover } satisfies Story;
export const IsPressed = { parameters: isPressed } satisfies Story;
export const IsFocus = { parameters: isFocus } satisfies Story;
export const IsOn = { args: { saved: true } } satisfies Story;
export const IsOnIsHover = { args: { saved: true }, parameters: isHover } satisfies Story;
export const IsOnIsPressed = { args: { saved: true }, parameters: isPressed } satisfies Story;
export const IsOnIsFocus = { args: { saved: true }, parameters: isFocus } satisfies Story;
export const IsBusy = {
  args: { saved: true, busy: true },
  play: async ({ args, canvasElement }) => {
    const button = within(canvasElement).getByRole('button', { name: 'Favourite' });
    await expect(button).toHaveAttribute('aria-busy', 'true');
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(button);
    await expect(args.onSavedChange).not.toHaveBeenCalled();
  }
} satisfies Story;
