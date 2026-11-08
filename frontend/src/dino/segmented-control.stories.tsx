import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';

import { SegmentedControl } from '@/dino/segmented-control';

type Units = 'metric' | 'us';

const options: { value: Units; label: string }[] = [
  { value: 'metric', label: 'Metric' },
  { value: 'us', label: 'US' }
];

const meta = {
  title: 'Dino/SegmentedControl',
  component: SegmentedControl<Units>,
  args: { label: 'Units', options, value: 'metric', onValueChange: fn() }
} satisfies Meta<typeof SegmentedControl<Units>>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default = {
  render: (args) => {
    const [value, setValue] = useState(args.value);
    return <SegmentedControl {...args} value={value} onValueChange={setValue} />;
  },
  play: async ({ canvasElement, step }) => {
    const group = within(within(canvasElement).getByRole('group', { name: 'Units' }));
    const metric = group.getByRole('radio', { name: 'Metric' });
    const us = group.getByRole('radio', { name: 'US' });

    await step('Choose US', async () => {
      await userEvent.click(us);
      await expect(us).toBeChecked();
      await expect(metric).not.toBeChecked();
      await expect(us.closest('label')?.querySelector('svg')).not.toBeNull();
      await expect(metric.closest('label')?.querySelector('svg')).toBeNull();
    });

    await step('Choose with the keyboard', async () => {
      await userEvent.click(metric);
      metric.blur();
      await userEvent.tab();
      await expect(metric).toHaveFocus();
      await userEvent.keyboard('{ArrowRight}');
      await expect(us).toHaveFocus();
      await expect(us).toBeChecked();
      await userEvent.tab();
      await expect(metric).not.toHaveFocus();
      await expect(us).not.toHaveFocus();
    });
  }
} satisfies Story;

const otherSegment = 'label:not(:has(:checked))';

export const IsHover = { parameters: { pseudo: { hover: [otherSegment] } } } satisfies Story;
export const IsPressed = { parameters: { pseudo: { active: [otherSegment] } } } satisfies Story;
export const IsFocus = { parameters: { pseudo: { focusVisible: ['input:checked'] } } } satisfies Story;

type Scope = 'personal' | 'household';

const scopes: { value: Scope; label: string }[] = [
  { value: 'personal', label: 'Just you' },
  { value: 'household', label: 'Household' }
];

const whoSees = (scope: Scope) =>
  scope === 'personal' ? 'Only you see it.' : 'Everyone in The Bedinis sees it and can change it.';

// In a form: the label shown above the track, and a line under it saying what the chosen option means.
export const WithHelpLine = {
  render: () => {
    const [value, setValue] = useState<Scope>('personal');
    return (
      <SegmentedControl
        label="Who's it for?"
        labelVisible
        description={whoSees(value)}
        options={scopes}
        value={value}
        onValueChange={setValue}
      />
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const group = canvas.getByRole('group', { name: "Who's it for?" });
    await expect(canvas.getByText("Who's it for?")).toBeVisible();
    await expect(group).toHaveAccessibleDescription('Only you see it.');

    await userEvent.click(within(group).getByRole('radio', { name: 'Household' }));

    await expect(group).toHaveAccessibleDescription('Everyone in The Bedinis sees it and can change it.');
  }
} satisfies Story;
