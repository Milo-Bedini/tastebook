import type { ComponentType } from 'react';
import { createContext, useContext } from 'react';

import type { FavouriteTarget } from './favourite-slot';

type SaveToListProps = { recipe: FavouriteTarget };

type SaveToListParts = {
  // Opens the sheet of your lists.
  Button: ComponentType<SaveToListProps>;
  // Names the lists that hold the recipe.
  SavedIn: ComponentType<SaveToListProps>;
};

// Lists belong to collections, which depends on recipes, so the app hands Save to list in here, as it does the heart.
// With none given, recipes show neither part.
export const SaveToListSlot = createContext<SaveToListParts | null>(null);

export const SaveToList = ({ recipe }: SaveToListProps) => {
  const parts = useContext(SaveToListSlot);
  return parts === null ? null : <parts.Button recipe={recipe} />;
};

export const SavedIn = ({ recipe }: SaveToListProps) => {
  const parts = useContext(SaveToListSlot);
  return parts === null ? null : <parts.SavedIn recipe={recipe} />;
};
