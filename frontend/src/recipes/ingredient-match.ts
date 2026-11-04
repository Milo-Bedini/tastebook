import type { components } from '../api/schema';
import { matchRange } from '../dino';

type IngredientOption = components['schemas']['IngredientOption'];

const names = (ingredient: IngredientOption) => [ingredient.name, ...ingredient.synonyms];

// The API's search rule: the name or any synonym contains the text, ignoring case and accents.
export const matchesIngredient = (ingredient: IngredientOption, text: string) =>
  names(ingredient).some((name) => matchRange(name, text) !== null);

// The text is the whole of the name or a synonym, ignoring case, accents and the text's surrounding spaces.
export const namesIngredient = (ingredient: IngredientOption, text: string) =>
  names(ingredient).some((name) => {
    const range = matchRange(name, text);
    return range !== null && range.start === 0 && range.end === name.length;
  });
