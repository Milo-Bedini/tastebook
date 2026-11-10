import { ImageDown, ImageOff, ImagePlus, Trash2 } from 'lucide-react';
import {
  type ChangeEvent,
  type DragEvent,
  type FocusEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState
} from 'react';

import { Button } from '@/dino/button';
import { cn } from '@/dino/cn';
import { FieldDescription } from '@/dino/field';
import { PlaceSetting } from '@/dino/photo-filler';
import type { Photo } from '@/dino/recipe-photo';
import { Spinner } from '@/dino/spinner';

type Shape = 'card' | 'hero';

export type PhotoFieldPhoto =
  | { status: 'stored'; photo: Photo }
  // progress is how far the upload has got, from 0 to 100.
  | { status: 'uploading'; file: File; progress: number }
  // whileSaving: it failed while the form waited to save, so the way on is removing the photo, not choosing another.
  // retryable: false when trying the same file again can only fail again, so Choose another takes Try again's place.
  | { status: 'failed'; whileSaving?: boolean; retryable?: boolean };

type PhotoFieldProps = {
  label: string;
  help?: string;
  error?: string;
  photo: PhotoFieldPhoto | null;
  shape?: Shape;
  // The stored photo's alt text; a photo still uploading is shown as decoration.
  alt: string;
  onChoose: (file: File) => void;
  onRemove: () => void;
  onRetry: () => void;
  onCancel: () => void;
};

const shapeStyles: Record<Shape, string> = { card: 'aspect-4/3', hero: 'aspect-7/5' };

// The frame is at most 400 px from tablets up, less its 10 px sides; on a phone it spans the column inside 20 px gutters.
const sizes = '(min-width: 40rem) 23.75rem, calc(100vw - 3.75rem)';

const frameWidth = 'w-full sm:max-w-100';

// The chosen file's own address, so its preview shows before the upload has made a thumbnail. Revoked when the file changes.
const usePreviewUrl = (file: File | undefined) => {
  const [preview, setPreview] = useState<{ file: File; url: string }>();
  useEffect(() => {
    if (file === undefined) {
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview({ file, url });
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return file !== undefined && preview?.file === file ? preview.url : undefined;
};

const carriesFiles = (event: DragEvent) => event.dataTransfer.types.includes('Files');

type DropBoxProps = {
  shape: Shape;
  invalid: boolean;
  icon: ReactNode;
  onDropFile: (file: File) => void;
  children: ReactNode;
};

const DropBox = ({ shape, invalid, icon, onDropFile, children }: DropBoxProps) => {
  const [dragging, setDragging] = useState(false);

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (carriesFiles(event)) {
      event.preventDefault();
      setDragging(true);
    }
  };
  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (!(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))) {
      setDragging(false);
    }
  };
  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file !== undefined) {
      onDropFile(file);
    }
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: dropping is for pointers only, an extra to Add a photo, which keyboard and touch use
    <div
      data-dragging={dragging || undefined}
      className={cn(
        'flex flex-col items-center justify-center gap-4 rounded-card border-2 border-dashed p-4 text-center',
        frameWidth,
        shapeStyles[shape],
        dragging ? 'border-3 border-ink border-solid bg-surface text-ink' : 'text-muted',
        !dragging && (invalid ? 'border-danger' : 'border-field')
      )}
      onDragEnter={handleDragOver}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {dragging ? (
        <>
          <ImageDown aria-hidden="true" className="pointer-events-none size-8" strokeWidth={2.25} />
          <p className="pointer-events-none text-label">Drop the photo to add it</p>
        </>
      ) : (
        <>
          {icon}
          {children}
        </>
      )}
    </div>
  );
};

type SnapshotProps = {
  shape: Shape;
  src: string | undefined;
  srcSet?: string;
  alt: string;
  busy: boolean;
  onError: () => void;
  children?: ReactNode;
};

// The polaroid's frame and lift without its tilt, as it has buttons under it.
const Snapshot = ({ shape, src, srcSet, alt, busy, onError, children }: SnapshotProps) => (
  <div className={cn('relative bg-paper p-2.5 shadow-lift', frameWidth)}>
    {src === undefined ? (
      <div className={cn(busy && 'opacity-45')}>
        <PlaceSetting shape={shape} />
      </div>
    ) : (
      <img
        src={src}
        srcSet={srcSet}
        sizes={srcSet === undefined ? undefined : sizes}
        alt={alt}
        decoding="async"
        // Sent without credentials, as RecipePhoto's are.
        crossOrigin="anonymous"
        className={cn('block w-full object-cover', shapeStyles[shape], busy && 'opacity-45')}
        onError={onError}
      />
    )}
    {children}
  </div>
);

const actions = 'flex flex-wrap gap-2';

export const PhotoField = ({
  label,
  help,
  error,
  photo,
  shape = 'hero',
  alt,
  onChoose,
  onRemove,
  onRetry,
  onCancel
}: PhotoFieldProps) => {
  const id = useId();
  const descriptionId = `${id}-description`;
  const input = useRef<HTMLInputElement>(null);
  const focusWithin = useRef(false);
  // Kept by address, so a preview or photo that can't load shows the filler (a HEIC file in most browsers).
  const [failedSrc, setFailedSrc] = useState<string>();
  const previewUrl = usePreviewUrl(photo?.status === 'uploading' ? photo.file : undefined);

  // The button pressed goes with its state (Remove photo, Cancel upload, Add a photo once a file is chosen),
  // so the next state's first button takes focus rather than leaving it on the page.
  const takeFocus = useCallback((button: HTMLButtonElement | null) => {
    const active = button?.ownerDocument.activeElement;
    if (button !== null && focusWithin.current && (active === null || active === button.ownerDocument.body)) {
      button.focus({ preventScroll: true });
    }
  }, []);

  const handleFocus = () => {
    focusWithin.current = true;
  };
  // Only a move to somewhere else counts: a removed button, or the picker taking the window, leaves no related target.
  const handleBlur = (event: FocusEvent<HTMLFieldSetElement>) => {
    if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) {
      focusWithin.current = false;
    }
  };

  const choose = () => input.current?.click();
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Cleared, so choosing the same file again still reports it.
    event.target.value = '';
    if (file !== undefined) {
      onChoose(file);
    }
  };

  const status = { stored: 'Photo uploaded', uploading: 'Uploading the photo', failed: '' }[photo?.status ?? 'failed'];
  const description = <FieldDescription id={descriptionId} help={help} error={error} />;

  const body = (() => {
    if (photo === null) {
      return (
        <DropBox
          shape={shape}
          invalid={error !== undefined}
          icon={<ImagePlus aria-hidden="true" className="size-8" strokeWidth={2.25} />}
          onDropFile={onChoose}
        >
          <Button ref={takeFocus} variant="secondary" onClick={choose}>
            Add a photo
          </Button>
        </DropBox>
      );
    }
    if (photo.status === 'failed') {
      return (
        <DropBox
          shape={shape}
          invalid
          icon={<ImageOff aria-hidden="true" className="size-8" strokeWidth={2.25} />}
          onDropFile={onChoose}
        >
          <div className="flex flex-wrap justify-center gap-2">
            {photo.retryable === false ? (
              <Button ref={takeFocus} variant="secondary" onClick={choose}>
                Choose another
              </Button>
            ) : (
              <Button ref={takeFocus} variant="secondary" onClick={onRetry}>
                Try again
              </Button>
            )}
            {photo.whileSaving ? (
              <Button variant="ghost" onClick={onRemove}>
                Remove photo
              </Button>
            ) : (
              photo.retryable !== false && (
                <Button variant="ghost" onClick={choose}>
                  Choose another
                </Button>
              )
            )}
          </div>
        </DropBox>
      );
    }
    if (photo.status === 'uploading') {
      const src = previewUrl === failedSrc ? undefined : previewUrl;
      return (
        <div className="flex flex-col gap-4">
          <Snapshot shape={shape} src={src} alt="" busy onError={() => setFailedSrc(previewUrl)}>
            <span
              aria-hidden="true"
              className="absolute bottom-5 left-5 inline-flex min-h-9 items-center gap-2 rounded-pill border-2 border-transparent bg-surface px-3.5 py-1.5 text-ink text-label tabular-nums"
            >
              <Spinner className="size-4.5" />
              Uploading… {Math.round(photo.progress)}%
            </span>
          </Snapshot>
          <div className={actions}>
            <Button ref={takeFocus} variant="ghost" onClick={onCancel}>
              Cancel upload
            </Button>
          </div>
        </div>
      );
    }
    const thumbnail = photo.photo.thumbnails[0]?.url;
    return (
      <div className="flex flex-col gap-4">
        <Snapshot
          shape={shape}
          src={thumbnail === failedSrc ? undefined : thumbnail}
          srcSet={photo.photo.thumbnails.map(({ width, url }) => `${url} ${width}w`).join(', ')}
          alt={alt}
          busy={false}
          onError={() => setFailedSrc(thumbnail)}
        />
        <div className={actions}>
          <Button ref={takeFocus} variant="secondary" onClick={choose}>
            Replace photo
          </Button>
          <Button variant="ghost" onClick={onRemove}>
            <Trash2 aria-hidden="true" strokeWidth={2.25} />
            Remove photo
          </Button>
        </div>
      </div>
    );
  })();

  return (
    <fieldset
      aria-describedby={error || help ? descriptionId : undefined}
      className="flex min-w-0 flex-col gap-1.5"
      onFocus={handleFocus}
      onBlur={handleBlur}
    >
      <legend className="mb-1.5 text-label">{label}</legend>
      {body}
      <p role="status" className="sr-only">
        {status}
      </p>
      {error ? <div role="alert">{description}</div> : description}
      <input ref={input} type="file" accept="image/*" hidden tabIndex={-1} onChange={handleChange} />
    </fieldset>
  );
};
