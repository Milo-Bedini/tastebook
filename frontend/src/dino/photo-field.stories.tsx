import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';

import { Button } from '@/dino/button';
import { PhotoField, type PhotoFieldPhoto } from '@/dino/photo-field';

const photoSvg =
  "%3Csvg xmlns='http://www.w3.org/2000/svg' width='700' height='500'%3E%3Crect width='700' height='500' fill='%23d9822b'/%3E%3Ccircle cx='220' cy='200' r='90' fill='%23f2c14e'/%3E%3Ccircle cx='470' cy='300' r='120' fill='%23c2410c'/%3E%3C/svg%3E";
const photoUrl = `data:image/svg+xml,${photoSvg}`;
const photoFile = new File([decodeURIComponent(photoSvg)], 'chana-masala.svg', { type: 'image/svg+xml' });
// Most browsers can't show a HEIC file, so its preview fails to load like this one.
const heicFile = new File(['HEIC'], 'IMG_0412.HEIC', { type: 'image/heic' });

const help = 'A JPEG, PNG, WebP or HEIC photo, up to 10 MB. It shows at the top of the recipe, cropped to this shape.';
const stored: PhotoFieldPhoto = { status: 'stored', photo: { thumbnails: [{ width: 700, url: photoUrl }] } };

const meta = {
  title: 'Dino/PhotoField',
  component: PhotoField,
  args: {
    label: 'Photo',
    help,
    photo: null,
    alt: 'The photo for Chana masala',
    onChoose: fn(),
    onRemove: fn(),
    onRetry: fn(),
    onCancel: fn()
  },
  // The board draws it at a phone's field width.
  decorators: [
    (Story) => (
      <div className="w-87.5">
        <Story />
      </div>
    )
  ]
} satisfies Meta<typeof PhotoField>;

export default meta;

type Story = StoryObj<typeof meta>;

const getField = (canvasElement: HTMLElement) => within(canvasElement).getByRole('group', { name: 'Photo' });

const getInput = (canvasElement: HTMLElement) => {
  const input = canvasElement.querySelector<HTMLInputElement>('input[type="file"]');
  if (input === null) {
    throw new Error('No file input');
  }
  return input;
};

// Stops the device's picker opening once, and reports whether a button asked for it.
const watchPicker = (canvasElement: HTMLElement) => {
  const opened = fn();
  getInput(canvasElement).addEventListener(
    'click',
    (event) => {
      opened();
      event.preventDefault();
    },
    { once: true }
  );
  return opened;
};

const drag = (target: Element, type: 'dragenter' | 'dragover' | 'drop', file: File) => {
  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);
  target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer }));
};

export const Empty = {
  play: async ({ canvasElement, args }) => {
    const field = getField(canvasElement);
    const canvas = within(field);
    await expect(field).toHaveAccessibleDescription(help);
    await expect(getInput(canvasElement)).toHaveAttribute('accept', 'image/*');

    const opened = watchPicker(canvasElement);
    const add = canvas.getByRole('button', { name: 'Add a photo' });
    await userEvent.click(add);
    await expect(opened).toHaveBeenCalledOnce();

    await userEvent.upload(getInput(canvasElement), photoFile);
    await expect(args.onChoose).toHaveBeenLastCalledWith(photoFile);

    const box = add.parentElement as HTMLElement;
    drag(box, 'dragenter', heicFile);
    drag(box, 'drop', heicFile);
    await expect(args.onChoose).toHaveBeenLastCalledWith(heicFile);
    await expect(canvas.getByRole('button', { name: 'Add a photo' })).toBeVisible();
  }
} satisfies Story;

export const DragOver = {
  args: { help: 'A JPEG, PNG, WebP or HEIC photo, up to 10 MB. Or drag one here. It shows at the top of the recipe.' },
  play: async ({ canvasElement }) => {
    const canvas = within(getField(canvasElement));
    const box = canvas.getByRole('button', { name: 'Add a photo' }).parentElement as HTMLElement;
    drag(box, 'dragenter', photoFile);
    drag(box, 'dragover', photoFile);
    await expect(await canvas.findByText('Drop the photo to add it')).toBeVisible();
    await expect(canvas.queryByRole('button', { name: 'Add a photo' })).toBeNull();
  }
} satisfies Story;

export const Uploading = {
  args: { photo: { status: 'uploading', file: photoFile, progress: 40 } },
  play: async ({ canvasElement, args }) => {
    const field = getField(canvasElement);
    const canvas = within(field);
    await expect(canvas.getByRole('status')).toHaveTextContent('Uploading the photo');
    await expect(canvas.getByText('Uploading… 40%')).toBeVisible();
    await waitFor(() => expect(field.querySelector('img')?.getAttribute('src')).toMatch(/^blob:/));
    await waitFor(() => expect(field.querySelector('img')?.naturalWidth).toBe(700));
    await expect(field.querySelector('img')).toHaveAttribute('alt', '');
    await userEvent.click(canvas.getByRole('button', { name: 'Cancel upload' }));
    await expect(args.onCancel).toHaveBeenCalledOnce();
  }
} satisfies Story;

export const UploadingHeic = {
  args: { photo: { status: 'uploading', file: heicFile, progress: 10 } },
  play: async ({ canvasElement }) => {
    const field = getField(canvasElement);
    await waitFor(() => expect(field.querySelector('[data-filler="place-setting"]')).not.toBeNull());
    await expect(field.querySelector('img')).toBeNull();
    await expect(within(field).getByText('Uploading… 10%')).toBeVisible();
  }
} satisfies Story;

export const Uploaded = {
  args: { photo: stored },
  play: async ({ canvasElement, args }) => {
    const canvas = within(getField(canvasElement));
    const photo = canvas.getByRole('img', { name: 'The photo for Chana masala' });
    await expect(photo).toHaveAttribute('src', photoUrl);
    await expect(getComputedStyle(photo).aspectRatio).toBe('7 / 5');
    await expect(canvas.getByRole('status')).toHaveTextContent('Photo uploaded');

    const opened = watchPicker(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Replace photo' }));
    await expect(opened).toHaveBeenCalledOnce();
    await userEvent.click(canvas.getByRole('button', { name: 'Remove photo' }));
    await expect(args.onRemove).toHaveBeenCalledOnce();
  }
} satisfies Story;

export const Card = {
  args: { photo: stored, shape: 'card' },
  play: async ({ canvasElement }) => {
    const photo = within(getField(canvasElement)).getByRole('img', { name: 'The photo for Chana masala' });
    await expect(getComputedStyle(photo).aspectRatio).toBe('4 / 3');
  }
} satisfies Story;

export const NotAPhoto = {
  args: { error: 'That’s a PDF. Choose a photo: a JPEG, PNG, WebP or HEIC.' },
  play: async ({ canvasElement }) => {
    const field = getField(canvasElement);
    await expect(field).toHaveAccessibleDescription('That’s a PDF. Choose a photo: a JPEG, PNG, WebP or HEIC.');
    await expect(within(field).getByRole('alert')).toHaveTextContent('That’s a PDF.');
    await expect(within(field).getByRole('button', { name: 'Add a photo' })).toBeVisible();
  }
} satisfies Story;

export const TooBig = {
  args: {
    error: 'That photo is 14 MB. Choose one under 10 MB, like one from your camera roll rather than the original file.'
  },
  play: async ({ canvasElement }) => {
    await expect(within(getField(canvasElement)).getByRole('alert')).toHaveTextContent('That photo is 14 MB.');
  }
} satisfies Story;

export const CouldntUpload = {
  args: {
    photo: { status: 'failed' },
    error: 'Couldn’t upload the photo. Check your connection, then try again.'
  },
  play: async ({ canvasElement, args }) => {
    const field = getField(canvasElement);
    const canvas = within(field);
    await expect(field).toHaveAccessibleDescription(
      'Couldn’t upload the photo. Check your connection, then try again.'
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Try again' }));
    await expect(args.onRetry).toHaveBeenCalledOnce();

    const opened = watchPicker(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Choose another' }));
    await expect(opened).toHaveBeenCalledOnce();
    await expect(canvas.queryByRole('button', { name: 'Remove photo' })).toBeNull();
  }
} satisfies Story;

export const SaveWhileUploading = {
  args: { photo: { status: 'uploading', file: photoFile, progress: 85 }, help: undefined },
  render: (args) => (
    <div className="flex flex-col gap-5">
      <PhotoField {...args} />
      <Button type="submit" loading loadingLabel="Saving…">
        Save recipe
      </Button>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const field = getField(canvasElement);
    await expect(within(field).getByText('Uploading… 85%')).toBeVisible();
    await waitFor(() => expect(field.querySelector('img')?.naturalWidth).toBe(700));
  }
} satisfies Story;

export const SaveFailed = {
  args: {
    photo: { status: 'failed', whileSaving: true },
    error:
      'Couldn’t upload the photo, so the recipe isn’t saved yet. Try again, or remove the photo and save without it.'
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(getField(canvasElement));
    await expect(canvas.getByRole('alert')).toHaveTextContent('so the recipe isn’t saved yet');
    await userEvent.click(canvas.getByRole('button', { name: 'Remove photo' }));
    await expect(args.onRemove).toHaveBeenCalledOnce();
    await expect(canvas.getByRole('button', { name: 'Try again' })).toBeVisible();
    await expect(canvas.queryByRole('button', { name: 'Choose another' })).toBeNull();
  }
} satisfies Story;

// Each button pressed goes with its state, so focus moves to the next state's first button.
export const FocusFollows = {
  args: { photo: stored },
  render: (args) => {
    const [photo, setPhoto] = useState(args.photo);
    return (
      <PhotoField
        {...args}
        photo={photo}
        onChoose={(file) => setPhoto({ status: 'uploading', file, progress: 0 })}
        onRemove={() => setPhoto(null)}
        onCancel={() => setPhoto(null)}
      />
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(getField(canvasElement));
    await userEvent.click(canvas.getByRole('button', { name: 'Remove photo' }));
    await expect(canvas.getByRole('button', { name: 'Add a photo' })).toHaveFocus();

    await userEvent.upload(getInput(canvasElement), photoFile);
    await expect(canvas.getByRole('button', { name: 'Cancel upload' })).toHaveFocus();

    await userEvent.click(canvas.getByRole('button', { name: 'Cancel upload' }));
    await expect(canvas.getByRole('button', { name: 'Add a photo' })).toHaveFocus();
  }
} satisfies Story;
