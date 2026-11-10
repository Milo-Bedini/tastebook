import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';

import { ListPicker, ListPickerRow } from '@/dino/list-picker';
import { isHover, isPressed } from '@/dino/story-states';

// The box alone, so the forced ring is drawn by the row around it, as a keyboard user sees it.
const isFocus = { pseudo: { focusVisible: ['button[role="checkbox"]'] } };

const meta = {
  title: 'Dino/ListPicker',
  component: ListPickerRow,
  args: {
    name: 'Weeknight dinners',
    count: '7 recipes',
    checked: false,
    onCheckedChange: fn()
  },
  // On Surface, as in the sheet that holds it.
  decorators: [
    (Story) => (
      <div className="rounded-card bg-surface p-4">
        <Story />
      </div>
    )
  ]
} satisfies Meta<typeof ListPickerRow>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default = {
  render: (args) => {
    const [checked, setChecked] = useState(args.checked);
    return (
      <ListPickerRow
        {...args}
        checked={checked}
        onCheckedChange={(next) => {
          args.onCheckedChange(next);
          setChecked(next);
        }}
      />
    );
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const checkbox = canvas.getByRole('checkbox', { name: 'Weeknight dinners' });
    await expect(checkbox).toHaveAccessibleDescription('7 recipes');
    await expect(checkbox).not.toBeChecked();

    await userEvent.click(canvas.getByText('7 recipes'));
    await expect(args.onCheckedChange).toHaveBeenLastCalledWith(true);
    await expect(checkbox).toBeChecked();

    await userEvent.keyboard(' ');
    await expect(args.onCheckedChange).toHaveBeenLastCalledWith(false);
    await expect(checkbox).not.toBeChecked();
  }
} satisfies Story;
export const IsOn = {
  args: { checked: true, count: '8 recipes' },
  play: async ({ canvasElement }) => {
    const checkbox = within(canvasElement).getByRole('checkbox', { name: 'Weeknight dinners' });
    await expect(checkbox).toHaveAttribute('aria-checked', 'true');
    // On is a check as well as mint, never colour alone.
    await expect(checkbox.querySelector('svg')).not.toBeNull();
  }
} satisfies Story;
export const IsHover = { parameters: isHover } satisfies Story;
export const IsOnIsHover = {
  args: { checked: true, name: 'Sunday roasts', count: '12 recipes' },
  parameters: isHover
} satisfies Story;
export const IsPressed = { parameters: isPressed } satisfies Story;
export const IsOnIsPressed = { args: { checked: true, count: '8 recipes' }, parameters: isPressed } satisfies Story;
export const IsFocus = { parameters: isFocus } satisfies Story;
export const Saving = {
  args: { checked: true, count: '8 recipes', saving: true },
  play: async ({ args, canvasElement }) => {
    const checkbox = within(canvasElement).getByRole('checkbox', { name: 'Weeknight dinners' });
    await expect(checkbox).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(checkbox);
    await expect(args.onCheckedChange).not.toHaveBeenCalled();
    await expect(checkbox).toBeChecked();
  }
} satisfies Story;
export const DidntSave = {
  args: { error: 'Couldn’t save it to Weeknight dinners. Check your connection, then tick it again.' },
  play: async ({ canvasElement }) => {
    const checkbox = within(canvasElement).getByRole('checkbox', { name: 'Weeknight dinners' });
    await expect(checkbox).not.toBeChecked();
    await expect(checkbox).not.toHaveAttribute('aria-busy');
    await expect(checkbox).toHaveAccessibleDescription(
      '7 recipes Couldn’t save it to Weeknight dinners. Check your connection, then tick it again.'
    );
    await expect(within(canvasElement).getByRole('alert')).toHaveTextContent(
      'Couldn’t save it to Weeknight dinners. Check your connection, then tick it again.'
    );
  }
} satisfies Story;
export const LongName = {
  args: { checked: true, name: 'Things to cook when Nonna visits in the summer holidays', count: '23 recipes' }
} satisfies Story;
export const EmptyList = {
  render: (args) => (
    <div className="flex flex-col gap-0.5">
      <ListPickerRow {...args} name="Favourites" count="Nothing saved yet" />
      <ListPickerRow {...args} name="Christmas" count="Nothing here yet" />
    </div>
  )
} satisfies Story;
export const Groups = {
  render: (args) => (
    <div className="flex flex-col gap-4">
      <ListPicker legend="Just you">
        <ListPickerRow {...args} name="Favourites" count="4 recipes" checked />
        <ListPickerRow {...args} name="Weeknight dinners" count="7 recipes" />
      </ListPicker>
      <ListPicker legend="The Bedinis">
        <ListPickerRow {...args} name="Christmas" count="Nothing here yet" />
        <ListPickerRow {...args} name="Sunday roasts" count="12 recipes" checked />
      </ListPicker>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const household = canvas.getByRole('group', { name: 'The Bedinis' });
    await expect(within(household).getByRole('checkbox', { name: 'Sunday roasts' })).toBeChecked();
    await expect(within(household).queryByRole('checkbox', { name: 'Favourites' })).toBeNull();
    await expect(
      within(canvas.getByRole('group', { name: 'Just you' })).getByRole('checkbox', { name: 'Favourites' })
    ).toBeChecked();
  }
} satisfies Story;
