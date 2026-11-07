import type { ComponentType } from 'react';
import { createContext, useContext } from 'react';

export type FavouriteTarget = { id: number; slug: string; title: string };

type FavouriteProps = { recipe: FavouriteTarget; label: string };

// The heart belongs to collections, which depends on recipes, so the app hands it in here rather than recipes
// importing it. With none given, recipes show no heart.
export const FavouriteSlot = createContext<ComponentType<FavouriteProps> | null>(null);

export const Favourite = ({ recipe, label }: FavouriteProps) => {
  const Heart = useContext(FavouriteSlot);
  return Heart === null ? null : <Heart recipe={recipe} label={label} />;
};
