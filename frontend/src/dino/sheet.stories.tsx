import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fireEvent, userEvent, waitFor, within } from 'storybook/test';

import { Button } from '@/dino/button';
import { CheckboxRow } from '@/dino/checkbox-row';
import { Note } from '@/dino/note';
import { Sheet } from '@/dino/sheet';

const TickedRow = ({ name, amount }: { name: string; amount: string }) => {
  const [checked, setChecked] = useState(true);
  return (
    <CheckboxRow amount={amount} checked={checked} onCheckedChange={setChecked}>
      {name}
    </CheckboxRow>
  );
};

const meta = {
  title: 'Dino/Sheet',
  component: Sheet,
  args: {
    trigger: <Button variant="secondary">Add to the list</Button>,
    title: 'Add to the list',
    description: 'Chana masala',
    // Built in the render, since "Add 3 things" closes the sheet through its state.
    children: null
  },
  render: (args) => {
    const [open, setOpen] = useState(false);
    return (
      <Sheet {...args} open={open} onOpenChange={setOpen}>
        <Note action={{ label: 'Add them', onClick: () => undefined }}>
          Left out salt, water and vegetable oil: you probably have them.
        </Note>
        <div className="flex flex-col">
          <TickedRow name="Garlic" amount="2 cloves" />
          <TickedRow name="Spinach" amount="275 g" />
          <TickedRow name="Bean sprouts" amount="225 g" />
        </div>
        <Button size="large" onClick={() => setOpen(false)}>
          Add 3 things
        </Button>
      </Sheet>
    );
  }
} satisfies Meta<typeof Sheet>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default = {} satisfies Story;
export const Open = {
  play: async ({ canvasElement, step }) => {
    // The sheet is portalled to the body, outside the story's canvas.
    const body = within(canvasElement.ownerDocument.body);
    const trigger = within(canvasElement).getByRole('button', { name: 'Add to the list' });
    const openSheet = async () => {
      await userEvent.click(trigger);
      const sheet = body.getByRole('dialog', { name: 'Add to the list' });
      // It slides up, so it's visible once the animation has started.
      await waitFor(() => expect(sheet).toBeVisible());
      return sheet;
    };
    const expectClosed = () => waitFor(() => expect(body.queryByRole('dialog')).not.toBeInTheDocument());

    await step('Open it', async () => {
      const sheet = await openSheet();
      await expect(sheet).toHaveAccessibleDescription('Chana masala');
      await expect(within(sheet).getByRole('button', { name: 'Close' })).toHaveFocus();
      await expect(sheet).toHaveStyle({
        borderTopLeftRadius: '32px',
        borderBottomLeftRadius: '0px',
        backgroundColor: 'rgb(42, 29, 71)'
      });
      await expect(within(sheet).getByRole('heading', { name: 'Add to the list' })).toHaveStyle({ fontSize: '34px' });
    });

    await step('Close each way', async () => {
      await userEvent.keyboard('{Escape}');
      await expectClosed();
      await expect(trigger).toHaveFocus();

      await userEvent.click(within(await openSheet()).getByRole('button', { name: 'Close' }));
      await expectClosed();

      await openSheet();
      const scrim = canvasElement.ownerDocument.querySelector('[data-slot="sheet-scrim"]');
      if (!(scrim instanceof HTMLElement)) throw new Error('The scrim is missing');
      // Its top-left corner, outside the sheet.
      await userEvent.pointer({ keys: '[MouseLeft]', target: scrim, coords: { clientX: 4, clientY: 4 } });
      await expectClosed();

      await userEvent.click(within(await openSheet()).getByRole('button', { name: 'Add 3 things' }));
      await expectClosed();
    });

    await step('Drag the header', async () => {
      const sheet = await openSheet();
      const settle = () => Promise.all(sheet.getAnimations().map((animation) => animation.finished));
      await settle();
      const grab = canvasElement.ownerDocument.querySelector('[data-slot="sheet-grab"]');
      if (!(grab instanceof HTMLElement)) throw new Error('The grab handle is missing');
      const close = body.getByRole('button', { name: 'Close' });
      const top = grab.getBoundingClientRect().top + 12;
      const closeY = close.getBoundingClientRect().top + close.offsetHeight / 2;
      const closeX = close.getBoundingClientRect().left + close.offsetWidth / 2;
      // One session, so a press in one call is still held in the next.
      const user = userEvent.setup();
      const press = (target: HTMLElement, clientX: number, clientY: number) =>
        user.pointer({ keys: '[MouseLeft>]', target, coords: { clientX, clientY } });
      const moveTo = (target: HTMLElement, clientX: number, clientY: number) =>
        user.pointer({ target, coords: { clientX, clientY } });
      const release = (target: HTMLElement, clientX: number, clientY: number) =>
        user.pointer({ keys: '[/MouseLeft]', target, coords: { clientX, clientY } });

      // A short drag by the handle: the sheet follows the pointer, then springs back open.
      await press(grab, 100, top);
      await moveTo(grab, 100, top + 40);
      await expect(sheet).toHaveStyle({ transform: 'matrix(1, 0, 0, 1, 0, 40)' });
      // A second finger lifted far down the header mid-drag neither moves nor closes the sheet.
      const farDown = { pointerId: 99, isPrimary: false, clientX: 100, clientY: top + sheet.offsetHeight };
      fireEvent.pointerMove(grab, farDown);
      fireEvent.pointerUp(grab, farDown);
      await expect(sheet).toHaveStyle({ transform: 'matrix(1, 0, 0, 1, 0, 40)' });
      await release(grab, 100, top + 40);
      await settle();
      await expect(sheet).toHaveStyle({ transform: 'none' });
      await expect(body.getByRole('dialog', { name: 'Add to the list' })).toBeVisible();

      // A press on the Close button doesn't drag the sheet.
      await press(close, closeX, closeY);
      await moveTo(close, closeX, closeY + 40);
      await expect(sheet).toHaveStyle({ transform: 'none' });
      await release(close, closeX, closeY);
      await expectClosed();

      // Dragged by its title past a quarter of its height, it closes. The sheet is a new one once reopened.
      const reopened = await openSheet();
      await Promise.all(reopened.getAnimations().map((animation) => animation.finished));
      const title = within(reopened).getByRole('heading', { name: 'Add to the list' });
      const titleY = title.getBoundingClientRect().top + title.offsetHeight / 2;
      await press(title, 100, titleY);
      await moveTo(title, 100, titleY + reopened.offsetHeight / 2);
      await release(title, 100, titleY + reopened.offsetHeight / 2);
      await expectClosed();
      await expect(trigger).toHaveFocus();
    });

    await step('Ends open', async () => {
      await openSheet();
    });
  }
} satisfies Story;
