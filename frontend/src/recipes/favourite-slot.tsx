import type { ComponentType, ReactNode } from 'react';
import { createContext, useContext } from 'react';

export type FavouriteTarget = { id: number; slug: string; title: string };

type FavouriteProps = { recipe: FavouriteTarget; label: string };

type FavouriteParts = {
  Heart: ComponentType<FavouriteProps>;
  // Sets up what every heart inside shares, once, so a long list doesn't set it up per card.
  Hearts: ComponentType<{ children: ReactNode }>;
};

// The heart belongs to collections, which depends on recipes, so the app hands it in here rather than recipes
// importing it. With none given, recipes show no heart.
export const FavouriteSlot = createContext<FavouriteParts | null>(null);

// Goes round every Favourite.
export const FavouriteHearts = ({ children }: { children: ReactNode }) => {
  const parts = useContext(FavouriteSlot);
  return parts === null ? children : <parts.Hearts>{children}</parts.Hearts>;
};

export const Favourite = ({ recipe, label }: FavouriteProps) => {
  const parts = useContext(FavouriteSlot);
  return parts === null ? null : <parts.Heart recipe={recipe} label={label} />;
};
