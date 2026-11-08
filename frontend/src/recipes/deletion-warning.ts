import type { components } from '../api/schema';

type Recipe = components['schemas']['Recipe'];

const counted = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export const deletionWarning = (recipe: Recipe): string => {
  const lines = [...recipe.ingredient_lines, ...recipe.ingredient_groups.flatMap((group) => group.lines)].length;
  const steps = recipe.steps.length;
  const counts = [
    ...(lines === 0 ? [] : [counted(lines, 'ingredient', 'ingredients')]),
    ...(steps === 0 ? [] : [counted(steps, 'step', 'steps')])
  ];
  // "Chana masala, its 8 ingredients and 5 steps"; "Chana masala and its 3 ingredients".
  const what =
    counts.length === 0
      ? recipe.title
      : `${recipe.title}${counts.length === 2 ? ',' : ' and'} its ${counts.join(' and ')}`;
  // "6 people saved this; they'll see it's gone."; nothing when nobody else did.
  const saves =
    recipe.save_count === null || recipe.save_count === 0
      ? ''
      : ` ${counted(recipe.save_count, 'person', 'people')} saved this; they'll see it's gone.`;
  return `${what} will be deleted for everyone in your household.${saves} You can't undo this.`;
};
