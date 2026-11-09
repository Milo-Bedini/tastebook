import { EyeOff, Hourglass, Link as LinkIcon, Pencil } from 'lucide-react';
import type { ComponentProps } from 'react';
import { Link, useLocation } from 'react-router';

import type { components } from '../api/schema';
import { Banner, Button, PrivateMark, Squiggle, TimeBlobs } from '../dino';
import { capitalise } from './capitalise';
import { describeDietTagConflict } from './diet-tags';
import { difficultyLabel } from './difficulty';
import { Favourite, FavouriteHearts } from './favourite-slot';
import { formatMinutes } from './format-minutes';
import { CopyRecipe, MADE_COPY } from './recipe-copy';
import { DeleteRecipe } from './recipe-delete';
import { RecipeGaps } from './recipe-gaps';
import { hasIngredients } from './recipe-ingredients';
import { RecipeReport } from './recipe-report';
import { RecipeShare } from './recipe-share';
import { RecipeVisibility } from './recipe-visibility';
import { useShareLinkGone, useVisibilityGone } from './recipes-api';
import { SavedIn, SaveToList } from './save-to-list-slot';

type Recipe = components['schemas']['Recipe'];
// What a share link shows too, which every recipe has.
type RecipeContent = components['schemas']['SharedRecipe'];

type RecipeProps = { recipe: Recipe };
type RecipeContentProps = { recipe: RecipeContent };

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
const servingsFact = (recipe: RecipeContent) => {
  if (hasIngredients(recipe)) {
    return '';
  }
  if (recipe.servings !== null) {
    return `Serves ${recipe.servings}`;
  }
  return recipe.yield_amount === null ? '' : `Makes ${recipe.yield_amount} ${recipe.yield_unit}`;
};

// Starts with the total time, the same number the list shows under the polaroid; a part the recipe lacks is left out.
const factsOf = (recipe: RecipeContent) =>
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

// A copy of a catalogue recipe shows the original's credit, which it can't edit, before any credit of its own.
const SourceLine = ({ source, sourceUrl }: SourceCreditProps) =>
  source === '' ? null : (
    <p className="min-w-0 break-words text-muted">
      Source: <SourceCredit source={source} sourceUrl={sourceUrl} />
    </p>
  );

type Times = ComponentProps<typeof TimeBlobs>['times'];

// Only the times the recipe has, in TimeBlobs' order: prep, cook, then the extra time.
const timesOf = ({ prep_minutes, cook_minutes, extra_minutes, extra_label }: RecipeContent): Times | null => {
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

const RecipeTimes = ({ recipe }: RecipeContentProps) => {
  const times = timesOf(recipe);
  return times === null ? null : <TimeBlobs times={times} />;
};

// A public household recipe credits its author where a private one shows its mark: one or the other, never both. One
// waiting for review has neither, as its banner says where it stands.
const RecipeCredit = ({ recipe }: RecipeProps) => {
  if (recipe.author !== null) {
    return <p className="text-muted">{`by ${recipe.author}`}</p>;
  }
  return recipe.visibility === 'private' && !recipe.waiting_for_review ? <PrivateMark /> : null;
};

// A private copy says where it was copied from; a public one credits the original as an adaptation. An original the
// account can't see any more is named by nothing, so a copy says nothing of a recipe that's no longer public.
const AdaptedFrom = ({ recipe }: RecipeProps) => {
  if (recipe.adapted_from === null) {
    return recipe.is_copy ? <p className="text-muted">Adapted from a recipe that's no longer public</p> : null;
  }
  const { slug, title, author } = recipe.adapted_from;
  const original = <Link to={`/recipes/${slug}`}>{title}</Link>;
  if (recipe.visibility === 'private') {
    return <p className="min-w-0 break-words text-muted">Copied from {original}</p>;
  }
  return (
    <p className="min-w-0 break-words text-muted">
      Adapted from {original}
      {author === null ? '' : ` by ${author}`}
    </p>
  );
};

const isMadeCopy = (state: unknown) =>
  typeof state === 'object' && state !== null && MADE_COPY in state && state[MADE_COPY] === true;

// The recipe as written, under its title and credit, the same on its own page and a share link's.
const RecipeFacts = ({ recipe }: RecipeContentProps) => {
  const facts = factsOf(recipe);
  return (
    <>
      {recipe.description !== '' && <p className="text-muted">{recipe.description}</p>}
      {facts !== '' && <p className="text-muted tabular-nums">{facts}</p>}
      {recipe.equipment.length > 0 && <p className="text-muted">{`Equipment: ${namesOf(recipe.equipment)}`}</p>}
      <SourceLine source={recipe.original_source} sourceUrl={recipe.original_source_url} />
      <SourceLine source={recipe.source} sourceUrl={recipe.source_url} />
      {recipe.diet_tag_conflicts.map((conflict) => (
        <p key={conflict.ingredient.slug}>{describeDietTagConflict(conflict)}</p>
      ))}
      <RecipeTimes recipe={recipe} />
    </>
  );
};

// Read-only, and nothing of the household's: no heart, no author, no copy's original, no controls.
export const SharedRecipeIntro = ({ recipe }: RecipeContentProps) => (
  <div className="flex flex-col gap-4">
    <RecipeTitle title={recipe.title} takesFocus={false} />
    <p className="inline-flex items-center gap-1.5 text-muted">
      <LinkIcon aria-hidden="true" className="size-4.5 shrink-0" strokeWidth={2.5} />
      Shared with you by link
    </p>
    <RecipeFacts recipe={recipe} />
  </div>
);

export const RecipeIntro = ({ recipe }: RecipeProps) => {
  // A switch held focus; when the answer takes it off the page, focus goes to the title instead.
  const visibilityGone = useVisibilityGone(recipe.slug) && !recipe.can_publish;
  const shareGone = useShareLinkGone(recipe.slug) && !recipe.can_share;
  // Make a copy held focus on the original's page, so the copy's title takes it.
  const madeCopy = isMadeCopy(useLocation().state);
  return (
    <div className="flex flex-col gap-4">
      {/* The heart sits at the end of the title's row; the heading names the recipe, so it's just "Favourite". */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3">
        <RecipeTitle title={recipe.title} takesFocus={visibilityGone || shareGone || madeCopy} />
        <FavouriteHearts>
          <Favourite recipe={recipe} label="Favourite" />
        </FavouriteHearts>
      </div>
      <RecipeCredit recipe={recipe} />
      {recipe.hidden_for_review && (
        <Banner tone="warning" icon={EyeOff} title="Hidden while a report is reviewed">
          Someone reported this recipe, so only you can see it until staff have looked at it. You can still edit or
          delete it.
        </Banner>
      )}
      {recipe.waiting_for_review && (
        <Banner tone="warning" icon={Hourglass} title="Waiting for review">
          You've made several recipes public today, so staff will check this one before anyone else can see it. You can
          still edit it, or turn off Public to withdraw it.
        </Banner>
      )}
      <AdaptedFrom recipe={recipe} />
      <RecipeFacts recipe={recipe} />
      <SavedIn recipe={recipe} />
      <RecipeGaps recipe={recipe} />
      {recipe.can_publish && (
        <div className="flex flex-col gap-3">
          <RecipeVisibility recipe={recipe} />
          {recipe.can_share && <RecipeShare recipe={recipe} />}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <SaveToList recipe={recipe} />
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
      {recipe.can_report && (
        <div className="flex flex-col items-start gap-1 border-line border-t pt-3">
          <RecipeReport recipe={recipe} />
        </div>
      )}
    </div>
  );
};
