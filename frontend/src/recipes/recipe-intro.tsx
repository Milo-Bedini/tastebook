import { Pencil } from 'lucide-react';
import type { ComponentProps } from 'react';
import { Link } from 'react-router';

import type { components } from '../api/schema';
import { Button, PrivateMark, Squiggle, TimeBlobs } from '../dino';
import { capitalise } from './capitalise';
import { describeDietTagConflict } from './diet-tags';
import { difficultyLabel } from './difficulty';
import { formatMinutes } from './format-minutes';
import { DeleteRecipe } from './recipe-delete';
import { RecipeGaps } from './recipe-gaps';
import { hasIngredients } from './recipe-ingredients';

type Recipe = components['schemas']['Recipe'];

type RecipeProps = { recipe: Recipe };

const namesOf = (names: { name: string }[]) => names.map(({ name }) => name).join(', ');

// The first word is often "A" or "The", so the squiggle goes under the longest, the first of equals.
const RecipeTitle = ({ title }: { title: string }) => {
  const words = title.split(' ');
  const longest = words.reduce((found, word, index) => (word.length > (words[found]?.length ?? 0) ? index : found), 0);
  const before = words.slice(0, longest).join(' ');
  const after = words.slice(longest + 1).join(' ');
  return (
    <h1 className="break-words">
      {before !== '' && `${before} `}
      <Squiggle>{words[longest]}</Squiggle>
      {after !== '' && ` ${after}`}
    </h1>
  );
};

// With no ingredients there's no stepper to say how many it serves, so the line says it instead.
const servingsFact = (recipe: Recipe) => {
  if (hasIngredients(recipe)) {
    return '';
  }
  if (recipe.servings !== null) {
    return `Serves ${recipe.servings}`;
  }
  return recipe.yield_amount === null ? '' : `Makes ${recipe.yield_amount} ${recipe.yield_unit}`;
};

// Starts with the total time, the same number the list shows under the polaroid; a part the recipe lacks is left out.
const factsOf = (recipe: Recipe) =>
  [
    recipe.total_minutes === null ? '' : formatMinutes(recipe.total_minutes),
    difficultyLabel(recipe.difficulty),
    recipe.one_pot ? 'One-pot' : '',
    namesOf(recipe.cuisines),
    namesOf(recipe.courses),
    servingsFact(recipe)
  ]
    .filter((fact) => fact !== '')
    .join(' · ');

type SourceCreditProps = { source: string; sourceUrl: string };

// The credit itself is the link, so its accessible name is the whole credit.
const SourceCredit = ({ source, sourceUrl }: SourceCreditProps) => {
  if (sourceUrl === '') {
    return source;
  }
  return <a href={sourceUrl}>{source}</a>;
};

type Times = ComponentProps<typeof TimeBlobs>['times'];

// Only the times the recipe has, in TimeBlobs' order: prep, cook, then the extra time.
const timesOf = ({ prep_minutes, cook_minutes, extra_minutes, extra_label }: Recipe): Times | null => {
  const times = [
    prep_minutes === null ? null : { label: 'Prep', value: formatMinutes(prep_minutes) },
    cook_minutes === null ? null : { label: 'Cook', value: formatMinutes(cook_minutes) },
    extra_minutes === 0 ? null : { label: capitalise(extra_label), value: formatMinutes(extra_minutes) }
  ].filter((time) => time !== null);
  const [first, second, third] = times;
  if (first === undefined) {
    return null;
  }
  if (second === undefined) {
    return [first];
  }
  return third === undefined ? [first, second] : [first, second, third];
};

const RecipeTimes = ({ recipe }: RecipeProps) => {
  const times = timesOf(recipe);
  return times === null ? null : <TimeBlobs times={times} />;
};

export const RecipeIntro = ({ recipe }: RecipeProps) => {
  const facts = factsOf(recipe);
  return (
    <div className="flex flex-col gap-4">
      <RecipeTitle title={recipe.title} />
      {recipe.visibility === 'private' && <PrivateMark />}
      {recipe.description !== '' && <p className="text-muted">{recipe.description}</p>}
      {facts !== '' && <p className="text-muted tabular-nums">{facts}</p>}
      {recipe.equipment.length > 0 && <p className="text-muted">{`Equipment: ${namesOf(recipe.equipment)}`}</p>}
      {recipe.source !== '' && (
        <p className="min-w-0 break-words text-muted">
          Source: <SourceCredit source={recipe.source} sourceUrl={recipe.source_url} />
        </p>
      )}
      {recipe.diet_tag_conflicts.map((conflict) => (
        <p key={conflict.ingredient.slug}>{describeDietTagConflict(conflict)}</p>
      ))}
      <RecipeTimes recipe={recipe} />
      <RecipeGaps recipe={recipe} />
      {(recipe.visibility === 'private' || recipe.can_delete) && (
        <div className="flex flex-wrap gap-2">
          {/* A private recipe reaches its page only for its own household, so anyone seeing it may edit it. */}
          {recipe.visibility === 'private' && (
            <Button asChild variant="secondary">
              <Link to={`/recipes/${recipe.slug}/edit`}>
                <Pencil aria-hidden="true" strokeWidth={2.5} />
                Edit recipe
              </Link>
            </Button>
          )}
          {recipe.can_delete && <DeleteRecipe recipe={recipe} />}
        </div>
      )}
    </div>
  );
};
