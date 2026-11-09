import type { Meta, StoryObj } from '@storybook/react-vite';
import { EyeOff } from 'lucide-react';
import { expect, within } from 'storybook/test';

import { Banner } from '@/dino/banner';
import { Button } from '@/dino/button';

const meta = {
  title: 'Dino/Banner',
  component: Banner
} satisfies Meta<typeof Banner>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Success = {
  args: { tone: 'success', title: 'Imported', children: 'All 9 ingredients and 6 steps came across.' }
} satisfies Story;
export const Warning = {
  args: {
    tone: 'warning',
    title: 'Imported, with 2 gaps',
    children: 'Two ingredients had no amount. Add them before you cook.',
    action: <Button variant="secondary">Fill the gaps</Button>
  },
  play: async ({ canvasElement }) => {
    const banner = within(canvasElement).getByRole('status');
    await expect(within(banner).getByRole('button', { name: 'Fill the gaps' })).toBeVisible();
    await expect(banner).toHaveStyle({
      borderTopColor: 'rgb(255, 224, 138)',
      borderTopLeftRadius: '20px',
      backgroundColor: 'rgb(42, 29, 71)'
    });
  }
} satisfies Story;
export const WarningWithIcon = {
  args: {
    tone: 'warning',
    icon: EyeOff,
    title: 'Hidden while a report is reviewed',
    children:
      'Someone reported this recipe, so only you can see it until staff have looked at it. You can still edit or delete it.'
  },
  play: async ({ canvasElement }) => {
    const banner = within(canvasElement).getByRole('status');
    const icon = banner.querySelector('svg');
    await expect(icon).toHaveClass('lucide-eye-off');
    await expect(icon).toHaveStyle({ color: 'rgb(255, 224, 138)' });
    await expect(banner).toHaveStyle({ borderTopColor: 'rgb(255, 224, 138)' });
  }
} satisfies Story;
export const Danger = {
  args: {
    tone: 'danger',
    title: 'Couldn’t reach that page',
    children: 'Check the link is a recipe page, like bbcgoodfood.com/recipes/…, then try again.',
    action: <Button variant="secondary">Try again</Button>
  },
  play: async ({ canvasElement }) => {
    const banner = within(canvasElement).getByRole('alert');
    await expect(within(banner).getByRole('button', { name: 'Try again' })).toBeVisible();
  }
} satisfies Story;
