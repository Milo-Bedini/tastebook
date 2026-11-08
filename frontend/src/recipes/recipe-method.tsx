import { useId } from 'react';

import type { components } from '../api/schema';
import { Method } from '../dino';
import { convertTemperatures } from './convert';
import type { Reading } from './recipe-ingredients';

// What a share link shows too, which every recipe has, so the shared page lists them the same.
type RecipeContent = components['schemas']['SharedRecipe'];

type RecipeMethodProps = { recipe: RecipeContent; reading: Reading };

export const RecipeMethod = ({ recipe, reading: { system, showOriginal } }: RecipeMethodProps) => {
  const headingId = useId();
  if (recipe.steps.length === 0) {
    return null;
  }
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4 lg:col-start-2 lg:row-start-2">
      <h2 id={headingId}>Method</h2>
      <Method
        steps={recipe.steps.map((step) => ({
          key: step.id,
          text: showOriginal ? step.text : convertTemperatures(step.text, system)
        }))}
      />
    </section>
  );
};
