import type { Meta, StoryObj } from '@storybook/react-vite';
import { BookOpen, ListChecks, Users } from 'lucide-react';
import { MemoryRouter } from 'react-router';
import { expect, userEvent, within } from 'storybook/test';

import { type NavTab, TopBarTabs } from '@/dino/top-bar-tabs';

const recipes: NavTab = { to: '/recipes', label: 'Recipes', icon: BookOpen };
const shopping: NavTab = { to: '/shopping', label: 'Shopping', icon: ListChecks };
const household: NavTab = { to: '/household', label: 'Household', icon: Users };

const meta = {
  title: 'Dino/TopBarTabs',
  component: TopBarTabs,
  args: { tabs: [recipes, shopping, household] },
  parameters: { path: '/recipes' },
  decorators: [
    (Story, { parameters }) => (
      <MemoryRouter initialEntries={[parameters.path]}>
        <Story />
      </MemoryRouter>
    )
  ]
} satisfies Meta<typeof TopBarTabs>;

export default meta;

type Story = StoryObj<typeof meta>;

const isLaptop = () => window.matchMedia('(min-width: 64rem)').matches;

// Under Vitest the viewport is a laptop's, where every tab is named; the visual run is a phone's, where only the
// current tab is named and the others are their icons. Either way each tab's accessible name is its label.
export const Default = {
  play: async ({ canvasElement }) => {
    const nav = within(within(canvasElement).getByRole('navigation', { name: 'Main' }));
    const tabs = nav.getAllByRole('link');
    await expect(tabs.map((tab) => tab.textContent)).toEqual(['Recipes', 'Shopping', 'Household']);
    await expect(nav.getByRole('link', { name: 'Recipes' })).toHaveAttribute('aria-current', 'page');
    await expect(nav.getByRole('link', { name: 'Shopping' })).not.toHaveAttribute('aria-current');
    await expect(nav.getByRole('link', { name: 'Household' })).toHaveAttribute('href', '/household');
    const visibleIcons = tabs.filter((tab) => tab.querySelector('svg')?.checkVisibility());
    await expect(visibleIcons).toHaveLength(isLaptop() ? 0 : 3);
  }
} satisfies Story;

// From 640 to 1023 px the bar has room for one name: the current tab's.
export const Compact = {
  parameters: {
    viewport: { options: { tablet: { name: 'Tablet', styles: { width: '834px', height: '1112px' }, type: 'tablet' } } }
  },
  globals: { viewport: { value: 'tablet' } },
  play: async ({ canvasElement }) => {
    const nav = within(canvasElement);
    const tabs = nav.getAllByRole('link');
    await expect(tabs.filter((tab) => tab.querySelector('svg')?.checkVisibility())).toHaveLength(3);
    await expect(nav.getByText('Recipes')).not.toHaveClass('max-lg:sr-only');
    await expect(nav.getByText('Shopping')).toHaveClass('max-lg:sr-only');
    await expect(nav.getByRole('link', { name: 'Shopping' })).toHaveProperty('offsetWidth', 44);
  }
} satisfies Story;

export const ShoppingCurrent = {
  parameters: { path: '/shopping' },
  play: async ({ canvasElement }) => {
    const nav = within(canvasElement);
    await expect(nav.getByRole('link', { name: 'Shopping' })).toHaveAttribute('aria-current', 'page');
    await expect(nav.getByRole('link', { name: 'Recipes' })).not.toHaveAttribute('aria-current');
  }
} satisfies Story;

// A page under a tab's address, like a recipe's under Recipes, keeps that tab current.
export const HouseholdCurrent = {
  parameters: { path: '/household/invite' },
  play: async ({ canvasElement }) => {
    const nav = within(canvasElement);
    await expect(nav.getByRole('link', { name: 'Household' })).toHaveAttribute('aria-current', 'page');
    await expect(nav.getByRole('link', { name: 'Recipes' })).not.toHaveAttribute('aria-current');
  }
} satisfies Story;

export const TwoTabs = {
  args: { tabs: [recipes, household] },
  play: async ({ canvasElement }) => {
    const links = within(canvasElement).getAllByRole('link');
    await expect(links.map((link) => link.textContent)).toEqual(['Recipes', 'Household']);
  }
} satisfies Story;

// With one tab there's nowhere else to go, so there is no navigation.
export const OneTab = {
  args: { tabs: [recipes] },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole('navigation')).toBeNull();
    await expect(canvasElement).toBeEmptyDOMElement();
  }
} satisfies Story;

export const ByKeyboard = {
  play: async ({ canvasElement }) => {
    const nav = within(canvasElement);
    await userEvent.tab();
    await expect(nav.getByRole('link', { name: 'Recipes' })).toHaveFocus();
    await userEvent.tab();
    const shoppingTab = nav.getByRole('link', { name: 'Shopping' });
    await expect(shoppingTab).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(shoppingTab).toHaveAttribute('aria-current', 'page');
    await expect(nav.getByRole('link', { name: 'Recipes' })).not.toHaveAttribute('aria-current');
  }
} satisfies Story;

const otherTab = 'a[href="/shopping"]';
const currentTab = 'a[aria-current="page"]';

export const IsHover = { parameters: { pseudo: { hover: [otherTab] } } } satisfies Story;
export const IsPressed = { parameters: { pseudo: { active: [otherTab] } } } satisfies Story;
export const IsFocus = { parameters: { pseudo: { focusVisible: [otherTab] } } } satisfies Story;
export const IsCurrentHover = { parameters: { pseudo: { hover: [currentTab] } } } satisfies Story;
export const IsCurrentPressed = { parameters: { pseudo: { active: [currentTab] } } } satisfies Story;
export const IsCurrentFocus = { parameters: { pseudo: { focusVisible: [currentTab] } } } satisfies Story;
