import type { ReactNode } from 'react';

import type { components } from '../api/schema';
import type { Lean } from '../dino';
import { PolaroidCard, PrivateMark } from '../dino';
import { difficultyLabel } from './difficulty';
import { formatMinutes } from './format-minutes';

type RecipeSummary = components['schemas']['RecipeSummary'];

// A list's name and address, which a recipe opened from it offers as the way back.
export type OpenedFrom = { name: string; path: string };

const metaOf = (recipe: RecipeSummary) => {
  const cuisineNames = recipe.cuisines.map(({ name }) => name).join(', ');
  const totalTime = recipe.total_minutes === null ? '' : formatMinutes(recipe.total_minutes);
  const parts = [totalTime, difficultyLabel(recipe.difficulty), cuisineNames];
  return parts.filter((part) => part !== '').join(' · ');
};

type RecipeMetaProps = { author: string | null; isPrivate: boolean; meta: string };

// The mark, or a public household recipe's credit in its place, sits above the meta, so it's read with the card.
const RecipeMeta = ({ author, isPrivate, meta }: RecipeMetaProps) => (
  <>
    {author !== null && <p>{`by ${author}`}</p>}
    {author === null && isPrivate && (
      <span className="mb-1 block">
        <PrivateMark />
      </span>
    )}
    {meta !== '' && <p className="tabular-nums">{meta}</p>}
  </>
);

type RecipeCardProps = {
  recipe: RecipeSummary;
  lean: Lean;
  eager: boolean;
  // The list the recipe's page was opened from, for its back link.
  openedFrom?: OpenedFrom;
  action?: ReactNode;
};

// A card with no mark, credit or meta has no meta block at all, so its link has no empty description.
export const RecipeCard = ({ recipe, lean, eager, openedFrom, action }: RecipeCardProps) => {
  const isPrivate = recipe.visibility === 'private';
  const meta = metaOf(recipe);
  return (
    <li>
      <PolaroidCard
        title={recipe.title}
        to={`/recipes/${recipe.slug}`}
        state={openedFrom === undefined ? undefined : { openedFrom }}
        recipeId={recipe.id}
        photo={recipe.photo}
        lean={lean}
        eager={eager}
        action={action}
      >
        {(isPrivate || recipe.author !== null || meta !== '') && (
          <RecipeMeta author={recipe.author} isPrivate={isPrivate} meta={meta} />
        )}
      </PolaroidCard>
    </li>
  );
};
