import type { components } from '../api/schema';
import { Banner } from '../dino';
import { hasIngredients } from './recipe-ingredients';

type Recipe = components['schemas']['Recipe'];

// In the order the page lists them; only the parts a household recipe can be saved without.
export const recipeGaps = (recipe: Recipe): string[] =>
  [
    hasIngredients(recipe) ? '' : 'No ingredients yet',
    recipe.steps.length > 0 ? '' : 'No method yet',
    recipe.prep_minutes === null ? 'No prep time yet' : '',
    recipe.cook_minutes === null ? 'No cook time yet' : '',
    recipe.servings === null && recipe.yield_amount === null ? 'No servings yet' : ''
  ].filter((gap) => gap !== '');

type RecipeGapsProps = { recipe: Recipe };

// Only its household sees a private recipe, so only they're told what it still needs.
export const RecipeGaps = ({ recipe }: RecipeGapsProps) => {
  const gaps = recipeGaps(recipe);
  if (recipe.visibility !== 'private' || gaps.length === 0) {
    return null;
  }
  return (
    <Banner tone="warning" title="What's missing">
      <ul className="flex list-disc flex-col gap-0.5 pl-5">
        {gaps.map((gap) => (
          <li key={gap}>{gap}</li>
        ))}
      </ul>
    </Banner>
  );
};
