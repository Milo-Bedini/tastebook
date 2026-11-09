import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';

import { RadioList } from '@/dino/radio-list';
import { isPressed } from '@/dino/story-states';

type Reason = 'spam' | 'offensive' | 'copied' | 'other';

const spam = { value: 'spam' as const, label: 'Spam', hint: 'Adverts, links, or not a recipe' };
const offensive = { value: 'offensive' as const, label: 'Offensive', hint: 'Hateful, violent or explicit' };
const copied = {
  value: 'copied' as const,
  label: 'Copied without credit',
  hint: 'Someone else’s recipe, passed off as theirs'
};
const other = { value: 'other' as const, label: 'Something else', hint: 'Say what in the note' };

const meta = {
  title: 'Dino/RadioList',
  component: RadioList<Reason>,
  args: {
    legend: 'What’s wrong with it?',
    name: 'reason',
    options: [spam, offensive, copied, other],
    onValueChange: fn()
  },
  // On Surface, as in the sheet that holds it.
  decorators: [
    (Story) => (
      <div className="rounded-card bg-surface p-4">
        <Story />
      </div>
    )
  ]
} satisfies Meta<typeof RadioList<Reason>>;

export default meta;

// From the component, not the meta: Storybook's types reduce a generic component's disabled union to never.
type Story = StoryObj<typeof RadioList<Reason>>;

export const Default = {
  render: (args) => {
    const [value, setValue] = useState(args.value);
    return (
      <RadioList
        {...args}
        value={value}
        onValueChange={(next) => {
          args.onValueChange(next);
          setValue(next);
        }}
      />
    );
  },
  play: async ({ args, canvasElement, step }) => {
    const group = within(within(canvasElement).getByRole('group', { name: 'What’s wrong with it?' }));
    const spamRadio = group.getByRole('radio', { name: 'Spam' });
    const copiedRadio = group.getByRole('radio', { name: 'Copied without credit' });
    const otherRadio = group.getByRole('radio', { name: 'Something else' });

    await step('Each hint describes its radio', async () => {
      await expect(spamRadio).toHaveAccessibleDescription('Adverts, links, or not a recipe');
      await expect(group.getAllByRole('radio').filter((radio) => (radio as HTMLInputElement).checked)).toEqual([]);
    });

    await step('Choose by pressing anywhere on the row', async () => {
      await userEvent.click(group.getByText('Someone else’s recipe, passed off as theirs'));
      await expect(args.onValueChange).toHaveBeenLastCalledWith('copied');
      await expect(copiedRadio).toBeChecked();
      await expect(copiedRadio.closest('label')?.querySelector('svg')).not.toBeNull();
      await expect(spamRadio.closest('label')?.querySelector('svg')).toBeNull();
    });

    await step('One tab stop, and arrow keys move the choice', async () => {
      copiedRadio.blur();
      await userEvent.tab();
      await expect(copiedRadio).toHaveFocus();
      await userEvent.keyboard('{ArrowDown}');
      await expect(otherRadio).toHaveFocus();
      await expect(otherRadio).toBeChecked();
      await expect(args.onValueChange).toHaveBeenLastCalledWith('other');
      await expect(copiedRadio).not.toBeChecked();
      await userEvent.tab();
      await expect(group.queryAllByRole('radio').filter((radio) => radio === document.activeElement)).toEqual([]);
    });
  }
} satisfies Story;

export const IsOff = { args: { options: [spam] } } satisfies Story;
export const IsOn = {
  args: { options: [copied], value: 'copied' },
  play: async ({ canvasElement }) => {
    const radio = within(canvasElement).getByRole('radio', { name: 'Copied without credit' });
    await expect(radio).toBeChecked();
    // Chosen is a check as well as mint, never colour alone.
    await expect(radio.closest('label')?.querySelector('svg')).not.toBeNull();
  }
} satisfies Story;
export const IsHover = {
  args: { options: [offensive, other], value: 'other' },
  parameters: { pseudo: { hover: ['label'] } }
} satisfies Story;
export const IsPressed = { args: { options: [offensive], value: 'offensive' }, parameters: isPressed } satisfies Story;
// The radio alone, so the forced ring is drawn by the row around it, as a keyboard user sees it.
export const IsFocus = {
  args: { options: [spam] },
  parameters: { pseudo: { focusVisible: ['input'] } }
} satisfies Story;
export const NoHint = {
  args: { options: [{ value: 'spam', label: 'Spam' }] },
  play: async ({ canvasElement }) => {
    const radio = within(canvasElement).getByRole('radio', { name: 'Spam' });
    await expect(radio).not.toHaveAttribute('aria-describedby');
    // A name alone keeps the row at 56 px.
    await expect(radio.closest('label')?.offsetHeight).toBe(56);
  }
} satisfies Story;
export const WithError = {
  args: { options: [spam], error: 'Choose what’s wrong with it, like Spam.' },
  play: async ({ canvasElement }) => {
    const radio = within(canvasElement).getByRole('radio', { name: 'Spam' });
    await expect(radio).toHaveAttribute('aria-invalid', 'true');
    await expect(radio).toHaveAccessibleDescription(
      'Adverts, links, or not a recipe Choose what’s wrong with it, like Spam.'
    );
  }
} satisfies Story;
export const IsDisabled = {
  args: { options: [spam, offensive], value: 'offensive', disabled: true, disabledReason: 'Sending…' },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const spamRadio = canvas.getByRole('radio', { name: 'Spam' });
    await expect(spamRadio).toHaveAttribute('aria-disabled', 'true');
    await expect(spamRadio).toHaveAccessibleDescription('Adverts, links, or not a recipe Sending…');

    await userEvent.click(spamRadio);
    await expect(args.onValueChange).not.toHaveBeenCalled();
    await expect(spamRadio).not.toBeChecked();
    await expect(canvas.getByRole('radio', { name: 'Offensive' })).toBeChecked();
  }
} satisfies Story;
// The board's forced-colours tile: its forced-colours baseline shows the chosen box in Highlight.
export const ForcedColours = { args: { options: [spam, offensive], value: 'offensive' } } satisfies Story;
