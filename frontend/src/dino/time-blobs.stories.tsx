import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';

import { TimeBlobs } from '@/dino/time-blobs';

const meta = {
  title: 'Dino/TimeBlobs',
  component: TimeBlobs,
  args: {
    times: [
      { label: 'Prep', value: '15 min' },
      { label: 'Cook', value: '1 hr 30 min' },
      { label: 'Soaking', value: '12 hr' }
    ]
  }
} satisfies Meta<typeof TimeBlobs>;

export default meta;

type Story = StoryObj<typeof meta>;

const termsAndDefinitions = (canvasElement: HTMLElement) => {
  const definitions = within(canvasElement).getAllByRole('definition');
  return within(canvasElement)
    .getAllByRole('term')
    .map((term, index) => [term.textContent, definitions[index]?.textContent]);
};

export const Default = {
  play: async ({ canvasElement }) => {
    await expect(termsAndDefinitions(canvasElement)).toEqual([
      ['Prep', '15 min'],
      ['Cook', '1 hr 30 min'],
      ['Soaking', '12 hr']
    ]);
  }
} satisfies Story;

export const TwoTimes = {
  args: {
    times: [
      { label: 'Prep', value: '10 min' },
      { label: 'Cook', value: '25 min' }
    ]
  },
  play: async ({ canvasElement }) => {
    await expect(termsAndDefinitions(canvasElement)).toEqual([
      ['Prep', '10 min'],
      ['Cook', '25 min']
    ]);
  }
} satisfies Story;

export const OneTime = {
  args: { times: [{ label: 'Prep', value: '20 min' }] },
  play: async ({ canvasElement }) => {
    await expect(termsAndDefinitions(canvasElement)).toEqual([['Prep', '20 min']]);
  }
} satisfies Story;

// The first blob is peach whatever time it holds, so a lone cook time is a peach "Cook".
export const OnlyACookTime = {
  args: { times: [{ label: 'Cook', value: '45 min' }] },
  play: async ({ canvasElement }) => {
    await expect(termsAndDefinitions(canvasElement)).toEqual([['Cook', '45 min']]);
    const blob = within(canvasElement).getByRole('term').parentElement;
    await expect(blob).toHaveClass('bg-peach');
  }
} satisfies Story;

export const LargeText = {
  args: { times: [{ label: 'Prep', value: '20 min' }] }
} satisfies Story;
