import type { Decorator, Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router';
import { expect, within } from 'storybook/test';

import { Pagination } from '@/dino/pagination';

const recipesPage = (page: number) => (page === 1 ? '/recipes' : `/recipes?page=${page}`);

const meta = {
  title: 'Dino/Pagination',
  component: Pagination,
  args: { page: 2, pageCount: 6, to: recipesPage },
  decorators: [
    (Story) => (
      <MemoryRouter>
        <Story />
      </MemoryRouter>
    )
  ]
} satisfies Meta<typeof Pagination>;

export default meta;

type Story = StoryObj<typeof meta>;

const nextLink = 'a:last-of-type';

// From 420 px of room the pager is one row: the board's laptop and tablet look, wider than the visual run's phone.
const wide: Decorator[] = [
  (Story) => (
    <div className="w-120">
      <Story />
    </div>
  )
];

// A 320 px phone's column.
const narrow: Decorator[] = [
  (Story) => (
    <div className="w-70">
      <Story />
    </div>
  )
];

export const Default = {
  play: async ({ canvasElement }) => {
    const nav = within(within(canvasElement).getByRole('navigation', { name: 'Pages' }));
    await expect(nav.getByRole('link', { name: 'Previous' })).toHaveAttribute('href', '/recipes');
    await expect(nav.getByText('Page 2 of 6')).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Next' })).toHaveAttribute('href', '/recipes?page=3');
  }
} satisfies Story;
export const FirstPage = {
  args: { page: 1 },
  play: async ({ canvasElement }) => {
    const nav = within(within(canvasElement).getByRole('navigation', { name: 'Pages' }));
    await expect(nav.getAllByRole('link').map((link) => link.textContent)).toEqual(['Next']);
    await expect(nav.getByRole('link', { name: 'Next' })).toHaveAttribute('href', '/recipes?page=2');
  }
} satisfies Story;
export const LastPage = {
  args: { page: 6 },
  play: async ({ canvasElement }) => {
    const nav = within(within(canvasElement).getByRole('navigation', { name: 'Pages' }));
    await expect(nav.getAllByRole('link').map((link) => link.textContent)).toEqual(['Previous']);
    await expect(nav.getByText('Page 6 of 6')).toBeVisible();
  }
} satisfies Story;
export const IsHover = { parameters: { pseudo: { hover: [nextLink] } } } satisfies Story;
export const IsPressed = { parameters: { pseudo: { active: [nextLink] } } } satisfies Story;
export const IsFocus = { parameters: { pseudo: { focusVisible: [nextLink] } } } satisfies Story;
export const Wide = { decorators: wide } satisfies Story;
export const WideFirstPage = { args: { page: 1 }, decorators: wide } satisfies Story;
export const WideLastPage = { args: { page: 6 }, decorators: wide } satisfies Story;
export const Narrow = { args: { page: 12, pageCount: 40 }, decorators: narrow } satisfies Story;
export const NarrowFirstPage = { args: { page: 1, pageCount: 40 }, decorators: narrow } satisfies Story;
export const OnePage = {
  args: { page: 1, pageCount: 1 },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole('navigation')).toBeNull();
  }
} satisfies Story;
