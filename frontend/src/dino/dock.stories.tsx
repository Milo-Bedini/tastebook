import type { Meta, StoryObj } from '@storybook/react-vite';
import { BookOpen, CalendarDays, ListChecks, Users } from 'lucide-react';
import { MemoryRouter } from 'react-router';
import { expect, userEvent, within } from 'storybook/test';

import { Dock } from '@/dino/dock';
import type { NavTab } from '@/dino/top-bar-tabs';

const recipes: NavTab = { to: '/recipes', label: 'Recipes', icon: BookOpen };
const shopping: NavTab = { to: '/shopping', label: 'Shopping', icon: ListChecks };
const mealPlan: NavTab = { to: '/meal-plan', label: 'Meal plan', icon: CalendarDays };
const household: NavTab = { to: '/household', label: 'Household', icon: Users };

const meta = {
  title: 'Dino/Dock',
  component: Dock,
  args: { tabs: [recipes, shopping, household] },
  parameters: {
    layout: 'fullscreen',
    path: '/recipes',
    // The dock is for phones only, so its stories run at a phone's width under Vitest too.
    viewport: { options: { phone: { name: 'Phone', styles: { width: '390px', height: '844px' }, type: 'mobile' } } }
  },
  globals: { viewport: { value: 'phone' } },
  decorators: [
    (Story, { parameters }) => (
      <MemoryRouter initialEntries={[parameters.path]}>
        <Story />
      </MemoryRouter>
    )
  ]
} satisfies Meta<typeof Dock>;

export default meta;

type Story = StoryObj<typeof meta>;

const dockOf = (canvasElement: HTMLElement) => within(within(canvasElement).getByRole('navigation', { name: 'Main' }));

export const Default = {
  play: async ({ canvasElement }) => {
    const dock = dockOf(canvasElement);
    const tabs = dock.getAllByRole('link');
    await expect(tabs.map((tab) => tab.textContent)).toEqual(['Recipes', 'Shopping', 'Household']);
    const current = dock.getByRole('link', { name: 'Recipes' });
    await expect(current).toHaveAttribute('aria-current', 'page');
    await expect(dock.getByRole('link', { name: 'Shopping' })).not.toHaveAttribute('aria-current');
    // Only the current tab shows its name; the others are their icons, named by their labels.
    await expect(within(current).getByText('Recipes')).toBeVisible();
    await expect(dock.getByText('Shopping')).toHaveClass('sr-only');
    await expect(dock.getByText('Household')).toHaveClass('sr-only');
  }
} satisfies Story;

export const ShoppingCurrent = {
  parameters: { path: '/shopping' },
  play: async ({ canvasElement }) => {
    const dock = dockOf(canvasElement);
    await expect(dock.getByRole('link', { name: 'Shopping' })).toHaveAttribute('aria-current', 'page');
    await expect(dock.getByText('Shopping')).not.toHaveClass('sr-only');
    await expect(dock.getByText('Recipes')).toHaveClass('sr-only');
  }
} satisfies Story;

// A page under a tab's address, like a recipe's under Recipes, keeps that tab current.
export const HouseholdCurrent = {
  parameters: { path: '/household/invite' },
  play: async ({ canvasElement }) => {
    const dock = dockOf(canvasElement);
    await expect(dock.getByRole('link', { name: 'Household' })).toHaveAttribute('aria-current', 'page');
    await expect(dock.getByRole('link', { name: 'Recipes' })).not.toHaveAttribute('aria-current');
  }
} satisfies Story;

export const TwoTabs = {
  args: { tabs: [recipes, household] },
  play: async ({ canvasElement }) => {
    const links = dockOf(canvasElement).getAllByRole('link');
    await expect(links.map((link) => link.textContent)).toEqual(['Recipes', 'Household']);
  }
} satisfies Story;

export const FourTabs = {
  args: { tabs: [recipes, shopping, mealPlan, household] },
  play: async ({ canvasElement }) => {
    const links = dockOf(canvasElement).getAllByRole('link');
    await expect(links.map((link) => link.textContent)).toEqual(['Recipes', 'Shopping', 'Meal plan', 'Household']);
  }
} satisfies Story;

// With one tab there's nowhere else to go, so there is no dock and no space kept for it.
export const OneTab = {
  args: { tabs: [recipes] },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole('navigation')).toBeNull();
    await expect(canvasElement).toBeEmptyDOMElement();
  }
} satisfies Story;

export const ByKeyboard = {
  play: async ({ canvasElement }) => {
    const dock = dockOf(canvasElement);
    await userEvent.tab();
    await expect(dock.getByRole('link', { name: 'Recipes' })).toHaveFocus();
    await userEvent.tab();
    const householdTab = dock.getByRole('link', { name: 'Household' });
    await userEvent.tab();
    await expect(householdTab).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(householdTab).toHaveAttribute('aria-current', 'page');
    await expect(dock.getByText('Household')).not.toHaveClass('sr-only');
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
