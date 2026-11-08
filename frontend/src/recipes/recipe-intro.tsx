import { Pencil } from 'lucide-react';
import type { ComponentProps } from 'react';
import { Link, useLocation } from 'react-router';

import type { components } from '../api/schema';
import { Button, PrivateMark, Squiggle, TimeBlobs } from '../dino';
import { capitalise } from './capitalise';
import { describeDietTagConflict } from './diet-tags';
import { difficultyLabel } from './difficulty';
import { Favourite, FavouriteHearts } from './favourite-slot';
import { formatMinutes } from './format-minutes';
import { CopyRecipe, MADE_COPY } from './recipe-copy';
import { DeleteRecipe } from './recipe-delete';
import { RecipeGaps } from './recipe-gaps';
import { hasIngredients } from './recipe-ingredients';
import { RecipeVisibility } from './recipe-visibility';
import { useVisibilityGone } from './recipes-api';

type Recipe = components['schemas']['Recipe'];

type RecipeProps = { recipe: Recipe };

const namesOf = (names: { name: string }[]) => names.map(({ name }) => name).join(', ');

const takeFocus = (element: HTMLElement | null) => element?.focus();

type RecipeTitleProps = { title: string; takesFocus: boolean };

// The first word is often "A" or "The", so the squiggle goes under the longest, the first of equals.
const RecipeTitle = ({ title, takesFocus }: RecipeTitleProps) => {
  const words = title.split(' ');
  const longest = words.reduce((found, word, index) => (word.length > (words[found]?.length ?? 0) ? index : found), 0);
  const before = words.slice(0, longest).join(' ');
  const after = words.slice(longest + 1).join(' ');
  return (
    <h1 ref={takesFocus ? takeFocus : undefined} tabIndex={-1} className="break-words">
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

// A public household recipe credits its author where a private one shows its mark: one or the other, never both.
const RecipeCredit = ({ recipe }: RecipeProps) => {
  if (recipe.author !== null) {
    return <p className="text-muted">{`by ${recipe.author}`}</p>;
  }
  return recipe.visibility === 'private' ? <PrivateMark /> : null;
};

const isMadeCopy = (state: unknown) =>
  typeof state === 'object' && state !== null && MADE_COPY in state && state[MADE_COPY] === true;

export const RecipeIntro = ({ recipe }: RecipeProps) => {
  const facts = factsOf(recipe);
  // The switch held focus; when the answer takes it off the page, focus goes to the title instead.
  const switchGone = useVisibilityGone(recipe.slug) && !recipe.can_publish;
  // Make a copy held focus on the original's page, so the copy's title takes it.
  const madeCopy = isMadeCopy(useLocation().state);
  return (
    <div className="flex flex-col gap-4">
      {/* The heart sits at the end of the title's row; the heading names the recipe, so it's just "Favourite". */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3">
        <RecipeTitle title={recipe.title} takesFocus={switchGone || madeCopy} />
        <FavouriteHearts>
          <Favourite recipe={recipe} label="Favourite" />
        </FavouriteHearts>
      </div>
      <RecipeCredit recipe={recipe} />
      {recipe.adapted_from !== null && (
        <p className="min-w-0 break-words text-muted">
          Copied from <Link to={`/recipes/${recipe.adapted_from.slug}`}>{recipe.adapted_from.title}</Link>
        </p>
      )}
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
      {recipe.can_publish && <RecipeVisibility recipe={recipe} />}
      <div className="flex flex-wrap gap-2">
        {recipe.can_edit && (
          <Button asChild variant="secondary">
            <Link to={`/recipes/${recipe.slug}/edit`}>
              <Pencil aria-hidden="true" strokeWidth={2.5} />
              Edit recipe
            </Link>
          </Button>
        )}
        <CopyRecipe recipe={recipe} />
        {recipe.can_delete && <DeleteRecipe recipe={recipe} />}
      </div>
    </div>
  );
};
