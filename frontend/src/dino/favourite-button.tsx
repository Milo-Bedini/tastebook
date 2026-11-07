import { Heart } from 'lucide-react';

type FavouriteButtonProps = {
  saved: boolean;
  onSavedChange: (saved: boolean) => void;
  busy?: boolean;
  label: string;
};

// The icon button's Favourite toggle, made one thing. While busy it keeps its look but takes no hover, press or click.
export const FavouriteButton = ({ saved, onSavedChange, busy, label }: FavouriteButtonProps) => (
  <button
    type="button"
    aria-label={label}
    aria-pressed={saved}
    aria-busy={busy || undefined}
    className="inline-grid size-11 shrink-0 cursor-pointer place-items-center rounded-pill border-2 border-transparent bg-surface text-ink transition not-aria-busy:hover:bg-line not-aria-busy:active:scale-94 not-aria-busy:active:bg-surface-pressed aria-pressed:bg-pink aria-pressed:text-on-pastel not-aria-busy:aria-pressed:hover:bg-pink-hover not-aria-busy:aria-pressed:active:bg-pink-pressed"
    onClick={() => {
      if (!busy) onSavedChange(!saved);
    }}
  >
    <Heart aria-hidden="true" strokeWidth={saved ? 2 : 2.5} className={saved ? 'size-5 fill-current' : 'size-5'} />
  </button>
);
