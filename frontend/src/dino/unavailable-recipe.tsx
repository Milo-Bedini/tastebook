import { EyeOff } from 'lucide-react';
import type { ReactNode } from 'react';

type UnavailableRecipeProps = {
  // As it was when the recipe was saved.
  title: string;
  action: ReactNode;
};

// A screen reader hears the title, then "No longer available. Made private or deleted.", so the box's words are
// hidden and said again, in that order, with the meta.
export const UnavailableRecipe = ({ title, action }: UnavailableRecipeProps) => (
  <li className="flex flex-col gap-3">
    <div className="flex flex-col border-2 border-field border-dashed px-2 pt-2">
      <div
        aria-hidden="true"
        className="flex aspect-4/3 flex-col items-center justify-center gap-1.5 bg-surface px-2 text-center text-muted text-small"
      >
        <EyeOff size={22} strokeWidth={2.25} />
        No longer available
      </div>
      <h2 className="break-words px-0.5 pt-1 pb-2 text-caption text-muted">{title}</h2>
    </div>
    <div className="flex items-end gap-2">
      <p className="flex min-h-11 flex-1 items-center text-muted text-small">
        <span className="sr-only">No longer available. </span>
        Made private or deleted
      </p>
      {action}
    </div>
  </li>
);
