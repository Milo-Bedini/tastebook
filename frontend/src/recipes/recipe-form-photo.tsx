import { useRef, useState } from 'react';

import { PhotoField, type PhotoFieldPhoto } from '../dino';
import { useSession } from '../households';
import { type StoredPhoto, useUploadPhoto } from './recipe-form-api';
import { useMediaQuery } from './use-media-query';

const MB = 1024 * 1024;
const MAX_PHOTO_BYTES = 10 * MB;
// Vercel refuses a request over 4.5 MB (4,500,000 bytes), so a photo sent leaves room for the rest of the request.
const MAX_SENT_BYTES = 4_400_000;
// The longest side a photo is sent at (docs/architecture.md, Photos).
const LONGEST_SIDE = 1600;

const PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
const PHOTO_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif']);

// What a file that isn't a photo is, in the words of the refusal; any other is "That file".
const fileKinds: Record<string, string> = {
  pdf: "That's a PDF",
  gif: "That's a GIF",
  svg: "That's an SVG",
  mp4: "That's a video",
  mov: "That's a video",
  doc: "That's a Word document",
  docx: "That's a Word document",
  txt: "That's a text file"
};

export const COULDNT_UPLOAD = "Couldn't upload the photo. Check your connection, then try again.";
const TOO_BIG_TO_UPLOAD = 'That photo is too big to upload. Choose a smaller one, or a JPEG of it.';
export const COULDNT_UPLOAD_WHILE_SAVING =
  "Couldn't upload the photo, so the recipe isn't saved yet. Try again, or remove the photo and save without it.";

const extensionOf = (name: string) => (name.includes('.') ? (name.split('.').pop()?.toLowerCase() ?? '') : '');

// Some browsers give a HEIC file no type, so its name counts too.
const isPhoto = (file: File) =>
  PHOTO_TYPES.has(file.type) || (file.type === '' && PHOTO_EXTENSIONS.has(extensionOf(file.name)));

// Why a file can't be uploaded, checked on choosing so nothing is sent; undefined when it can.
export const refusalOf = (file: File): string | undefined => {
  if (!isPhoto(file)) {
    const kind = fileKinds[extensionOf(file.name)] ?? "That file isn't a photo";
    return `${kind}. Choose a photo: a JPEG, PNG, WebP or HEIC.`;
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return `That photo is ${Math.ceil(file.size / MB)} MB. Choose one under 10 MB, like one from your camera roll rather than the original file.`;
  }
  return undefined;
};

const drawable = async (file: File) => {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return undefined;
  }
};

// The photo at most 1,600 px on its longest side, turned as its camera held it. A photo the browser can't draw (a
// HEIC in most browsers) goes as it is, and Tastebook makes it smaller, if it's small enough to send.
export const resizePhoto = async (file: File): Promise<Blob> => {
  const bitmap = await drawable(file);
  if (bitmap === undefined) {
    return file;
  }
  const scale = Math.min(1, LONGEST_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  // A PNG keeps any see-through parts, which a JPEG would fill black.
  const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  const resized = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.9));
  return resized ?? file;
};

type Upload =
  | { status: 'uploading'; file: File; progress: number }
  // retryable: sending the same file again could work; a photo too big to send can't.
  | { status: 'failed'; file: File; message: string; whileSaving: boolean; retryable: boolean };

// What an upload came to: cancelled leaves the recipe's photo as it was.
export type UploadOutcome = { kind: 'stored'; photo: StoredPhoto } | { kind: 'failed' } | { kind: 'cancelled' };

type Pending = { controller: AbortController; outcome: Promise<UploadOutcome> };

// The photo being uploaded, if any: the recipe's own photo is the form's, which onStored sets.
export const usePhotoUpload = (onStored: (photo: StoredPhoto) => void) => {
  const uploadPhoto = useUploadPhoto();
  const { refetch: checkSession } = useSession();
  const [upload, setUpload] = useState<Upload | null>(null);
  const pending = useRef<Pending | null>(null);

  const fail = (file: File, message: string, retryable: boolean): UploadOutcome => {
    setUpload({ status: 'failed', file, message, whileSaving: false, retryable });
    return { kind: 'failed' };
  };

  const send = async (file: File, signal: AbortSignal): Promise<UploadOutcome> => {
    const onProgress = (progress: number) =>
      setUpload((current) =>
        current?.status === 'uploading' && current.file === file ? { ...current, progress } : current
      );
    try {
      const photo = await resizePhoto(file);
      if (photo === file && file.size > MAX_SENT_BYTES) {
        return fail(
          file,
          `That photo is ${(file.size / MB).toFixed(1)} MB and this browser can't make it smaller, so it's too big to upload. Choose one under 4 MB, or a JPEG of it.`,
          false
        );
      }
      const name = photo === file ? file.name : `${file.name.replace(/\.[^.]*$/, '')}.${photo.type.split('/')[1]}`;
      const result = await uploadPhoto.mutateAsync({ photo, name, onProgress, signal });
      if (signal.aborted) {
        return { kind: 'cancelled' };
      }
      if (result.kind === 'stored') {
        setUpload(null);
        onStored(result.photo);
        return result;
      }
      if (result.kind === 'refused') {
        return fail(file, result.message, true);
      }
      if (result.kind === 'too-big') {
        return fail(file, TOO_BIG_TO_UPLOAD, false);
      }
      // Signed out meanwhile: the session's answer sends a visitor to sign-in.
      await checkSession();
      return fail(file, COULDNT_UPLOAD, true);
    } catch {
      return signal.aborted ? { kind: 'cancelled' } : fail(file, COULDNT_UPLOAD, true);
    }
  };

  const start = (file: File) => {
    pending.current?.controller.abort();
    const controller = new AbortController();
    setUpload({ status: 'uploading', file, progress: 0 });
    const entry: Pending = {
      controller,
      // Only a failure stays to be settled: a stored photo is the form's from then on.
      outcome: send(file, controller.signal).then((outcome) => {
        if (outcome.kind !== 'failed' && pending.current === entry) {
          pending.current = null;
        }
        return outcome;
      })
    };
    pending.current = entry;
  };

  const cancel = () => {
    pending.current?.controller.abort();
    pending.current = null;
    setUpload(null);
  };

  // What the upload under way comes to, or the failure still showing; null when there's neither. A failure that
  // can't be retried keeps its reason, as Try again isn't on offer.
  const settle = async (): Promise<UploadOutcome | null> => {
    const outcome = pending.current === null ? null : await pending.current.outcome;
    if (outcome?.kind === 'failed') {
      setUpload((current) =>
        current?.status === 'failed'
          ? {
              ...current,
              message: current.retryable ? COULDNT_UPLOAD_WHILE_SAVING : current.message,
              whileSaving: true
            }
          : current
      );
    }
    return outcome;
  };

  const retry = () => {
    if (upload !== null) {
      start(upload.file);
    }
  };

  return { upload, start, cancel, retry, settle };
};

type PhotoSectionProps = {
  photo: StoredPhoto | null;
  upload: Upload | null;
  title: string;
  error: string | undefined;
  onChoose: (file: File) => void;
  onRemove: () => void;
  onRetry: () => void;
  onCancel: () => void;
};

const HELP = 'A JPEG, PNG, WebP or HEIC photo, up to 10 MB. It shows at the top of the recipe, cropped to this shape.';
const HELP_WITH_DRAGGING =
  'A JPEG, PNG, WebP or HEIC photo, up to 10 MB. Or drag one here. It shows at the top of the recipe, cropped to this shape.';

export const PhotoSection = ({ photo, upload, title, error, ...handlers }: PhotoSectionProps) => {
  // Dropping a file is for a pointer on a wider screen, so only there does the help offer it.
  const canDrag = useMediaQuery('(min-width: 40rem) and (pointer: fine)');
  const fieldPhoto = ((): PhotoFieldPhoto | null => {
    if (upload?.status === 'uploading') {
      return upload;
    }
    if (upload?.status === 'failed') {
      return { status: 'failed', whileSaving: upload.whileSaving, retryable: upload.retryable };
    }
    return photo === null ? null : { status: 'stored', photo };
  })();
  return (
    <PhotoField
      label="Photo"
      help={canDrag ? HELP_WITH_DRAGGING : HELP}
      error={upload?.status === 'failed' ? upload.message : error}
      photo={fieldPhoto}
      alt={title.trim() === '' ? 'The photo for this recipe' : `The photo for ${title.trim()}`}
      {...handlers}
    />
  );
};
