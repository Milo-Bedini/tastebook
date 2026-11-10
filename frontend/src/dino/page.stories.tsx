import type { Meta, StoryObj } from '@storybook/react-vite';
import { BookOpen, Library } from 'lucide-react';
import { MemoryRouter } from 'react-router';
import { expect, within } from 'storybook/test';

import { Dock } from '@/dino/dock';
import { Page } from '@/dino/page';
import { TopBar } from '@/dino/top-bar';
import type { NavTab } from '@/dino/top-bar-tabs';

const meta = {
  title: 'Dino/Page',
  component: Page,
  parameters: { layout: 'fullscreen' }
} satisfies Meta<typeof Page>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default = {
  args: {
    children: (
      <>
        <h1>What shall we cook tonight?</h1>
        <p>Every recipe in the catalogue and your household's own.</p>
      </>
    )
  },
  play: async ({ canvasElement }) => {
    // 20 px gutters on a phone, as in the visual run, and 32 px from 640 px, as under Vitest.
    const gutter = window.matchMedia('(min-width: 40rem)').matches ? '32px' : '20px';
    const main = within(canvasElement).getByRole('main');
    await expect(getComputedStyle(main).paddingLeft).toBe(gutter);
    await expect(getComputedStyle(main).paddingRight).toBe(gutter);
    await expect(getComputedStyle(main).paddingBottom).toBe('48px');
  }
} satisfies Story;

const tabs: NavTab[] = [
  { to: '/recipes', label: 'Recipes', icon: BookOpen },
  { to: '/lists', label: 'Lists', icon: Library }
];

// Mounted as the app does, the dock after the top bar: the page starts under the bar and keeps the dock's 104 px at
// its foot instead.
export const WithDock = {
  args: Default.args,
  parameters: {
    // The dock is for phones only, so this runs at a phone's width under Vitest too.
    viewport: { options: { phone: { name: 'Phone', styles: { width: '390px', height: '844px' }, type: 'mobile' } } }
  },
  globals: { viewport: { value: 'phone' } },
  render: (args) => (
    <MemoryRouter initialEntries={['/recipes']}>
      <TopBar searchLabel="Search recipes" searchValue="" onSearchValueChange={() => {}} tabs={tabs} />
      <Dock tabs={tabs} />
      <Page {...args} />
    </MemoryRouter>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const main = canvas.getByRole('main');
    await expect(getComputedStyle(main).paddingBottom).toBe('104px');
    await expect(main.getBoundingClientRect().top).toBe(canvas.getByRole('banner').getBoundingClientRect().bottom);
  }
} satisfies Story;
