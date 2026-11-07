import { FavouriteButton } from '../dino';
import { useSession } from '../households';
import type { FavouriteTarget } from '../recipes';
import { useFavourites } from './lists-api';
import { useHeart } from './use-heart';

type FavouriteToggleProps = { recipe: FavouriteTarget; label: string };

// The heart on a recipe's page and on its card. It turns at once and stays busy until the answer; a failure turns it
// back. Whether it's saved is read from Favourites, so every heart for a recipe agrees.
export const FavouriteToggle = ({ recipe, label }: FavouriteToggleProps) => {
  const { account } = useSession();
  const favourites = useFavourites({ enabled: Boolean(account) });
  const heart = useHeart();
  const saved = favourites.data?.saved_recipes.find((entry) => entry.recipe?.id === recipe.id);
  const isSaved = heart.saving || (!heart.unsaving && saved !== undefined);
  // Until it's known who is signed in, and what they saved, a press can't know which way to turn.
  const isKnown = account === null || (account !== undefined && !favourites.isPending);

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
    <FavouriteButton
      label={label}
      saved={isSaved}
      busy={heart.saving || heart.unsaving || !isKnown}
      onSavedChange={change}
    />
  );
};
