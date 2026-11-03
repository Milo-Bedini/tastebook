import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fireEvent, fn, userEvent, within } from 'storybook/test';

import { Combobox, type ComboboxOption } from '@/dino/combobox';
import { matchRange } from '@/dino/match-range';

const toOptions = (names: string[]): ComboboxOption[] =>
  names.map((name) => ({ value: name.toLowerCase().replaceAll(' ', '-'), name }));

const meta = {
  title: 'Dino/Combobox',
  component: Combobox,
  args: {
    label: 'Ingredients',
    placeholder: 'Type an ingredient',
    // Every ingredient there is; the story offers those that match the search and aren't chosen.
    options: toOptions(['Chickpeas', 'Chicken thighs', 'Chickpea flour', 'Cumin']),
    chosen: toOptions(['Onion', 'Garlic']),
    search: '',
    onSearchChange: fn(),
    onChoose: fn(),
    onRemove: fn(),
    removeLabel: 'Remove ingredient',
    emptyText: 'No ingredients match.'
  },
  render: (args) => {
    const [search, setSearch] = useState(args.search);
    const [chosen, setChosen] = useState(args.chosen);
    const offered = args.options.filter(
      ({ value, name }) => !chosen.some((option) => option.value === value) && matchRange(name, search) !== null
    );
    const choose = (value: string) =>
      setChosen([...chosen, ...args.options.filter((option) => option.value === value)]);
    return (
      <Combobox
        {...args}
        options={offered}
        chosen={chosen}
        search={search}
        onSearchChange={setSearch}
        onChoose={choose}
        onRemove={(value) => setChosen(chosen.filter((option) => option.value !== value))}
      />
    );
  }
} satisfies Meta<typeof Combobox>;

export default meta;

type Story = StoryObj<typeof meta>;

const activeOption = (combobox: HTMLElement) =>
  combobox.ownerDocument.getElementById(combobox.getAttribute('aria-activedescendant') ?? '');

export const Default = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const combobox = canvas.getByRole('combobox', { name: 'Ingredients' });
    await expect(combobox).toHaveAttribute('aria-expanded', 'false');

    combobox.focus();
    await userEvent.keyboard('{ArrowDown}');
    await expect(combobox).toHaveAttribute('aria-expanded', 'true');
    await expect(canvas.getByRole('listbox', { name: 'Ingredients' })).toBeInTheDocument();
    await expect(activeOption(combobox)).toBe(canvas.getByRole('option', { name: 'Chickpeas' }));
    await expect(canvas.getByRole('option', { name: 'Chickpeas' })).toHaveAttribute('aria-selected', 'true');

    await userEvent.keyboard('{ArrowDown}');
    await expect(activeOption(combobox)).toHaveAccessibleName('Chicken thighs');
    await userEvent.keyboard('{ArrowUp}');
    await expect(activeOption(combobox)).toHaveAccessibleName('Chickpeas');

    await userEvent.keyboard('{Enter}');
    await expect(canvas.getByRole('button', { name: 'Remove ingredient: Chickpeas' })).toBeInTheDocument();
    await expect(canvas.queryByRole('listbox')).not.toBeInTheDocument();
    await expect(combobox).toHaveAttribute('aria-expanded', 'false');
    await expect(combobox).toHaveValue('');

    await userEvent.click(canvas.getByRole('button', { name: 'Remove ingredient: Chickpeas' }));
    await expect(canvas.queryByRole('button', { name: 'Remove ingredient: Chickpeas' })).not.toBeInTheDocument();
    await expect(combobox).toHaveFocus();

    await userEvent.type(combobox, 'chi');
    await expect(canvas.getByRole('listbox', { name: 'Ingredients' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await expect(canvas.queryByRole('listbox')).not.toBeInTheDocument();
    await expect(combobox).toHaveValue('chi');
    await userEvent.keyboard('{Escape}');
    await expect(combobox).toHaveValue('');
  }
} satisfies Story;
export const OpensWithUp = {
  play: async ({ canvasElement }) => {
    const combobox = within(canvasElement).getByRole('combobox', { name: 'Ingredients' });
    combobox.focus();
    await userEvent.keyboard('{ArrowUp}');
    await expect(activeOption(combobox)).toHaveAccessibleName('Cumin');
  }
} satisfies Story;
export const Bold = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole('combobox', { name: 'Ingredients' }), 'pea');
    const bold = canvas.getByRole('option', { name: 'Chickpeas' }).querySelector('b');
    await expect(bold).toHaveTextContent(/^pea$/);
    await expect(canvas.queryByRole('option', { name: 'Cumin' })).not.toBeInTheDocument();
  }
} satisfies Story;
export const LongList = {
  args: {
    chosen: [],
    options: toOptions([
      'Aubergine',
      'Basil',
      'Butter',
      'Carrots',
      'Chickpeas',
      'Coriander',
      'Cumin',
      'Garlic',
      'Ginger',
      'Lemons',
      'Lentils',
      'Limes',
      'Mint',
      'Onion',
      'Paprika',
      'Parsley',
      'Potatoes',
      'Rice',
      'Spinach',
      'Tomatoes'
    ])
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const combobox = canvas.getByRole('combobox', { name: 'Ingredients' });
    combobox.focus();
    await userEvent.keyboard('{ArrowDown>12/}');

    const listbox = canvas.getByRole('listbox', { name: 'Ingredients' });
    await expect(activeOption(combobox)).toHaveAccessibleName('Limes');
    await expect(listbox.scrollTop).toBeGreaterThan(0);
    const list = listbox.getBoundingClientRect();
    const active = activeOption(combobox)?.getBoundingClientRect();
    await expect(active?.top).toBeGreaterThanOrEqual(list.top);
    await expect(active?.bottom).toBeLessThanOrEqual(list.bottom);
  }
} satisfies Story;
export const NoMatch = {
  args: { search: 'kale', defaultOpen: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('status')).toHaveTextContent('No ingredients match.');
    await expect(canvas.getByRole('combobox', { name: 'Ingredients' })).toHaveAttribute('aria-expanded', 'false');
  }
} satisfies Story;
export const IsOpen = {
  args: { search: 'chick', defaultOpen: true },
  parameters: { pseudo: { focusVisible: ['input'] } }
} satisfies Story;
export const WrappedHint = {
  args: {
    chosen: [],
    options: [
      { value: 'vietnamese-caramel-sauce', name: 'Vietnamese caramel sauce', hint: 'also nuoc mau, nước màu' },
      { value: 'salted-caramel-sauce', name: 'Salted caramel sauce', hint: 'also caramel au beurre salé' }
    ],
    search: 'caramel',
    defaultOpen: true
  },
  // The narrowest reflow width (WCAG 1.4.10), so the hints wrap in the story tests' wider viewport too.
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    )
  ],
  play: async ({ canvasElement }) => {
    const option = within(canvasElement).getByRole('option', { name: /^Vietnamese caramel sauce/ });
    const text = option.querySelector('span')?.getBoundingClientRect();
    const box = option.getBoundingClientRect();
    // Two lines of text, with the option's 12 px padding still above and below them.
    await expect(text?.height).toBeGreaterThan(30);
    await expect(text?.top).toBeGreaterThanOrEqual(box.top + 12);
    await expect(text?.bottom).toBeLessThanOrEqual(box.bottom - 12);
  }
} satisfies Story;

// Keys are fired at the input rather than typed, so it never takes focus: the screenshot blurs whatever play left
// focused, and the blur would close the list this story shows.
export const WithAddOption = {
  args: {
    label: 'Add an ingredient',
    chosen: [],
    search: 'chipotle paste',
    defaultOpen: true,
    addOption: { label: 'Add “chipotle paste”', onAdd: fn() }
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const combobox = canvas.getByRole('combobox', { name: 'Add an ingredient' });
    await expect(activeOption(combobox)).toBe(canvas.getByRole('option', { name: 'Add “chipotle paste”' }));
    await expect(canvas.queryByText('No ingredients match.')).not.toBeInTheDocument();

    fireEvent.keyDown(combobox, { key: 'Enter' });
    await expect(args.addOption?.onAdd).toHaveBeenCalledOnce();
    await expect(combobox).toHaveAttribute('aria-expanded', 'false');
    await expect(combobox).toHaveValue('chipotle paste');

    fireEvent.keyDown(combobox, { key: 'ArrowDown' });
    await expect(activeOption(combobox)).toHaveAccessibleName('Add “chipotle paste”');
  }
} satisfies Story;
export const WithAddOptionBelowMatches = {
  args: {
    label: 'Add an ingredient',
    options: [
      { value: 'chicken-thighs', name: 'chicken thighs' },
      { value: 'chickpeas', name: 'chickpeas', hint: 'also garbanzo beans' }
    ],
    chosen: [],
    search: 'chick',
    addOption: { label: 'Add “chick”', onAdd: fn() }
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const combobox = canvas.getByRole('combobox', { name: 'Add an ingredient' });

    fireEvent.keyDown(combobox, { key: 'ArrowUp' });
    await expect(canvas.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'chicken thighs',
      'chickpeas · also garbanzo beans',
      'Add “chick”'
    ]);
    await expect(activeOption(combobox)).toBe(canvas.getByRole('option', { name: 'Add “chick”' }));
    await expect(canvas.getByRole('option', { name: 'Add “chick”' }).querySelector('b')).toHaveTextContent(/^chick$/);
  }
} satisfies Story;
