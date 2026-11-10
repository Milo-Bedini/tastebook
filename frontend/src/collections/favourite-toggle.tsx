import type { ReactNode } from 'react';
import { createContext, useContext } from 'react';

import { FavouriteButton } from '../dino';
import { useSession, useSignedInOnly } from '../households';
import type { FavouriteTarget } from '../recipes';
import { type SavedRecipe, useFavourites, usePendingSaves } from './lists-api';
import { useHeart } from './use-heart';

type HeartsState = {
  account: ReturnType<typeof useSession>['account'];
  favouritesPending: boolean;
  savedByRecipe: Map<number, SavedRecipe>;
  saving: string[];
  unsaving: (number | undefined)[];
  heart: ReturnType<typeof useHeart>;
};

const HeartsContext = createContext<HeartsState | null>(null);

// Who is signed in, their Favourites and the save actions, set up once for every heart inside: a list of hundreds of
// cards would otherwise set each up hundreds of times.
export const Hearts = ({ children }: { children: ReactNode }) => {
  const { account } = useSession();
  const favourites = useFavourites({ enabled: useSignedInOnly() });
  const { saving, unsaving } = usePendingSaves();
  const heart = useHeart();
  const savedByRecipe = new Map(
    (favourites.data?.saved_recipes ?? []).flatMap((entry) =>
      entry.recipe === null ? [] : [[entry.recipe.id, entry] as const]
    )
  );
  return (
    <HeartsContext value={{ account, favouritesPending: favourites.isPending, savedByRecipe, saving, unsaving, heart }}>
      {children}
    </HeartsContext>
  );
};

type FavouriteToggleProps = { recipe: FavouriteTarget; label: string };

// The heart on a recipe's page and on its card, inside Hearts. It turns at once and stays busy until the answer; a
// failure turns it back. Whether it's saved is read from Favourites, so every heart for a recipe agrees.
export const FavouriteToggle = ({ recipe, label }: FavouriteToggleProps) => {
  const hearts = useContext(HeartsContext);
  if (hearts === null) {
    throw new Error('FavouriteToggle needs Hearts round it');
  }
  const { account, favouritesPending, savedByRecipe, heart } = hearts;
  const saved = savedByRecipe.get(recipe.id);
  const isSaving = hearts.saving.includes(recipe.slug);
  const isUnsaving = hearts.unsaving.includes(recipe.id);
  const isSaved = isSaving || (!isUnsaving && saved !== undefined);
  // Until it's known who is signed in, and what they saved, a press can't know which way to turn.
  const isKnown = account === null || (account !== undefined && !favouritesPending);

  const change = (next: boolean) => {
    if (account === null) {
      void heart.signIn(recipe.slug);
    } else if (next) {
      void heart.add(recipe.slug);
    } else if (saved !== undefined) {
      void heart.remove(saved);
    }
  };

  return (
    <FavouriteButton label={label} saved={isSaved} busy={isSaving || isUnsaving || !isKnown} onSavedChange={change} />
  );
};
