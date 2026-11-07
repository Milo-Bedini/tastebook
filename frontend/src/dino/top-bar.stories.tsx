import type { Meta, StoryObj } from '@storybook/react-vite';
import { BookOpen, ListChecks, Users } from 'lucide-react';
import { useState } from 'react';
import { MemoryRouter } from 'react-router';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';

import type { MenuItem } from '@/dino/menu';
import { TopBar } from '@/dino/top-bar';
import type { NavTab } from '@/dino/top-bar-tabs';

const menuItems: MenuItem[] = [
  { kind: 'link', label: 'Account', to: '/account' },
  { kind: 'action', label: 'Sign out', onSelect: fn() }
];

const tabs: NavTab[] = [
  { to: '/recipes', label: 'Recipes', icon: BookOpen },
  { to: '/shopping', label: 'Shopping', icon: ListChecks },
  { to: '/household', label: 'Household', icon: Users }
];

const meta = {
  title: 'Dino/TopBar',
  component: TopBar,
  parameters: { layout: 'fullscreen' },
  args: { searchLabel: 'Search recipes', searchValue: '', onSearchValueChange: () => {} },
  // The value lives in React state: under Vitest, useArgs updates never re-render.
  render: (args) => {
    const [searchValue, setSearchValue] = useState(args.searchValue);
    return <TopBar {...args} searchValue={searchValue} onSearchValueChange={setSearchValue} />;
  },
  decorators: [
    (Story) => (
      <MemoryRouter>
        <Story />
      </MemoryRouter>
    )
  ]
} satisfies Meta<typeof TopBar>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('banner')).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Tastebook' })).toHaveAttribute('aria-current', 'page');
  }
} satisfies Story;

// The visual run is a phone, where the icon button opens the field under the bar; on a laptop, as under Vitest, the
// field is always in the bar and the button is hidden.
export const IsSearchOpen = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const searchBox = () => canvas.getByRole('searchbox', { name: 'Search recipes' });
    if (window.matchMedia('(min-width: 64rem)').matches) {
      await expect(searchBox()).toBeVisible();
      await expect(canvas.queryByRole('button', { name: 'Search recipes' })).toBeNull();
      return;
    }
    const button = canvas.getByRole('button', { name: 'Search recipes' });
    await expect(canvas.queryByRole('searchbox', { name: 'Search recipes' })).toBeNull();
    await userEvent.click(button);
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await expect(searchBox()).toBeVisible();
    await expect(searchBox()).toHaveFocus();
  }
} satisfies Story;

export const SignedIn = {
  args: { account: { status: 'signed-in', name: 'Milo Bedini', menuItems } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const avatar = canvas.getByRole('button', { name: 'Account for Milo Bedini' });
    await expect(avatar).toBeVisible();
    await expect(avatar).toHaveTextContent(/^M$/);
    await expect(avatar).toHaveAttribute('aria-haspopup', 'menu');
    await expect(canvas.queryByRole('link', { name: 'Sign in' })).toBeNull();
  }
} satisfies Story;

export const SignedOut = {
  args: { account: { status: 'signed-out', signInTo: '/sign-in' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/sign-in');
    await expect(canvas.queryByRole('button', { name: /^Account/ })).toBeNull();
  }
} satisfies Story;

export const IsMenuOpen = {
  args: { account: { status: 'signed-in', name: 'Milo Bedini', menuItems } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The menu is portalled to the body, outside the story's canvas.
    const body = within(canvasElement.ownerDocument.body);
    const avatar = canvas.getByRole('button', { name: 'Account for Milo Bedini' });
    // The wordmark, then the search (its button on a phone, its field on a laptop), then the avatar.
    await userEvent.tab();
    await userEvent.tab();
    await userEvent.tab();
    await expect(avatar).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(await body.findByRole('menu')).toHaveTextContent('Milo Bedini');
    await expect(body.getByRole('menuitem', { name: 'Account' })).toHaveFocus();
    await expect(avatar).toHaveAttribute('aria-expanded', 'true');
    await userEvent.keyboard('{End}');
    await expect(body.getByRole('menuitem', { name: 'Sign out' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(body.queryByRole('menu')).toBeNull());
    await expect(avatar).toHaveFocus();
    // Open again, so the shot shows the open menu.
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(body.getByRole('menu')).toBeVisible());
  }
} satisfies Story;

export const IsSignedInWithoutName = {
  args: { account: { status: 'signed-in', name: '', menuItems } },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const avatar = within(canvasElement).getByRole('button', { name: 'Account' });
    await expect(avatar).toBeVisible();
    await userEvent.click(avatar);
    await expect(body.getAllByRole('menuitem')).toHaveLength(2);
    await expect((await body.findByRole('menu')).textContent).toBe('AccountSign out');
  }
} satisfies Story;

// From 640 px the tabs sit after the wordmark, so focus meets them before search and the account end; the visual run
// is a phone, where the Dock holds them instead.
export const WithTabs = {
  args: { account: { status: 'signed-in', name: 'Milo Bedini', menuItems }, tabs },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    if (!window.matchMedia('(min-width: 40rem)').matches) {
      await expect(canvas.queryByRole('navigation', { name: 'Main' })).toBeNull();
      return;
    }
    const nav = within(canvas.getByRole('navigation', { name: 'Main' }));
    await expect(nav.getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Recipes',
      'Shopping',
      'Household'
    ]);
    await userEvent.tab();
    await expect(canvas.getByRole('link', { name: 'Tastebook' })).toHaveFocus();
    await userEvent.tab();
    await expect(nav.getByRole('link', { name: 'Recipes' })).toHaveFocus();
    await userEvent.tab();
    await userEvent.tab();
    await expect(nav.getByRole('link', { name: 'Household' })).toHaveFocus();
    await userEvent.tab();
    await expect(canvas.getByRole('searchbox', { name: 'Search recipes' })).toHaveFocus();
    await userEvent.tab();
    await expect(canvas.getByRole('button', { name: 'Account for Milo Bedini' })).toHaveFocus();
  }
} satisfies Story;

// With one tab there is no navigation.
export const WithOneTab = {
  args: { tabs: tabs.slice(0, 1) },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole('navigation')).toBeNull();
    await expect(within(canvasElement).queryByRole('link', { name: 'Recipes' })).toBeNull();
  }
} satisfies Story;
