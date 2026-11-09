import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';

import { isHover, isPressed } from '@/dino/story-states';
import { Switch } from '@/dino/switch';

const meta = {
  title: 'Dino/Switch',
  component: Switch,
  args: {
    children: 'Public',
    checked: false,
    onCheckedChange: fn()
  }
} satisfies Meta<typeof Switch>;

export default meta;

type Story = StoryObj<typeof meta>;

const disabledReason = 'Add a photo before making it public.';

const description =
  "Anyone you send the link to can see this recipe, without signing in. They see nothing else of your household's.";

export const Default = {
  render: (args) => {
    const [checked, setChecked] = useState(args.checked);
    return <Switch {...args} checked={checked} onCheckedChange={setChecked} />;
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const control = canvas.getByRole('switch', { name: 'Public' });
    await expect(control).not.toBeChecked();
    await userEvent.click(control);
    await expect(control).toBeChecked();
    await userEvent.click(canvas.getByText('Public'));
    await expect(control).not.toBeChecked();
    control.blur();
    await userEvent.tab();
    await expect(control).toHaveFocus();
    await userEvent.keyboard(' ');
    await expect(control).toBeChecked();
  }
} satisfies Story;
export const IsOn = {
  args: { checked: true },
  play: async ({ canvasElement }) => {
    const control = within(canvasElement).getByRole('switch', { name: 'Public' });
    await expect(control).toBeChecked();
    await expect(control).toHaveAttribute('aria-checked', 'true');
  }
} satisfies Story;
export const IsHover = { parameters: isHover } satisfies Story;
export const IsPressed = { parameters: isPressed } satisfies Story;
export const IsOnAndHover = { args: { checked: true }, parameters: isHover } satisfies Story;
export const IsOnAndPressed = { args: { checked: true }, parameters: isPressed } satisfies Story;
export const IsFocus = { parameters: { pseudo: { focusVisible: ['button[role="switch"]'] } } } satisfies Story;
export const IsDisabled = {
  args: { disabled: true, disabledReason },
  play: async ({ args, canvasElement }) => {
    const control = within(canvasElement).getByRole('switch', { name: 'Public' });
    await userEvent.tab();
    await expect(control).toHaveFocus();
    await expect(control).toHaveAttribute('aria-disabled', 'true');
    await expect(control).toHaveAccessibleDescription(disabledReason);
    await userEvent.click(control);
    await userEvent.keyboard(' ');
    await expect(args.onCheckedChange).not.toHaveBeenCalled();
    await expect(control).not.toBeChecked();
  }
} satisfies Story;
export const IsOnAndDisabled = {
  args: { checked: true, disabled: true, disabledReason },
  play: async ({ args, canvasElement }) => {
    const control = within(canvasElement).getByRole('switch', { name: 'Public' });
    await userEvent.click(control);
    await expect(args.onCheckedChange).not.toHaveBeenCalled();
    await expect(control).toBeChecked();
  }
} satisfies Story;
export const WithDescription = {
  args: { children: 'Share by link', description },
  play: async ({ canvasElement }) => {
    const control = within(canvasElement).getByRole('switch', { name: 'Share by link' });
    await expect(control).toHaveAccessibleDescription(description);
  }
} satisfies Story;
export const WithDescriptionIsOn = { args: { children: 'Share by link', description, checked: true } } satisfies Story;
export const WithDescriptionIsDisabled = {
  args: { children: 'Share by link', description, disabled: true, disabledReason: 'Saving…' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('switch', { name: 'Share by link' })).toHaveAccessibleDescription('Saving…');
    await expect(canvas.queryByText(description)).not.toBeInTheDocument();
  }
} satisfies Story;
