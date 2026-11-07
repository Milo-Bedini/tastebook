import { Plus, SlidersHorizontal } from 'lucide-react';
import type { RefObject } from 'react';
import { useCallback, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';

import type { components } from '../api/schema';
import type { Lean } from '../dino';
import { Button, EmptyState, ErrorWithRetry, Loading, Page, PolaroidCard, PrivateMark, Sheet, Squiggle } from '../dino';
import { ActiveFilters, countActiveFilters, useActiveFilters } from './active-filters';
import { difficultyLabel } from './difficulty';
import { formatMinutes } from './format-minutes';
import { RecipeFilterPanel } from './recipe-filter-panel';
import type { RecipeFilters } from './recipe-filters';
import { hasFilters, noFilters, readFilters, writeFilters } from './recipe-filters';
import type { RecipeQuery } from './recipes-api';
import { useRecipes } from './recipes-api';
import { useDebouncedValue } from './use-debounced-value';
import { isLaptopQuery, useMediaQuery } from './use-media-query';

type RecipeSummary = components['schemas']['RecipeSummary'];

const SEARCH_DELAY_MS = 300;
const MIN_SEARCH_LENGTH = 3;

// Shorter terms would match most of the list, so they search nothing and show it all.
const toSearchTerm = (text: string) => {
  const term = text.trim();
  return term.length >= MIN_SEARCH_LENGTH ? term : '';
};

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

type RecipeItemProps = { recipe: RecipeSummary; lean: Lean; eager: boolean };

// A card with no mark, credit or meta has no meta block at all, so its link has no empty description.
const RecipeItem = ({ recipe, lean, eager }: RecipeItemProps) => {
  const isPrivate = recipe.visibility === 'private';
  const meta = metaOf(recipe);
  return (
    <li>
      <PolaroidCard
        title={recipe.title}
        to={`/recipes/${recipe.slug}`}
        recipeId={recipe.id}
        photo={recipe.photo}
        lean={lean}
        eager={eager}
      >
        {(isPrivate || recipe.author !== null || meta !== '') && (
          <RecipeMeta author={recipe.author} isPrivate={isPrivate} meta={meta} />
        )}
      </PolaroidCard>
    </li>
  );
};

type NoRecipesProps = { query: RecipeQuery; onClearFilters: () => void };

const NoRecipes = ({ query: { searchTerm, filters }, onClearFilters }: NoRecipesProps) => {
  if (!hasFilters(filters)) {
    if (searchTerm === '') {
      return <EmptyState title="No recipes yet.">Recipes show here once they're in the catalogue.</EmptyState>;
    }
    return (
      <EmptyState title={`No recipes match “${searchTerm}”.`}>
        Nothing in the catalogue mentions it. Try another word.
      </EmptyState>
    );
  }
  const title =
    searchTerm === '' ? 'No recipes match these filters.' : `No recipes match “${searchTerm}” with these filters.`;
  return (
    <EmptyState
      title={title}
      action={
        <Button variant="secondary" onClick={onClearFilters}>
          Clear filters
        </Button>
      }
      doodle="one fewer?"
    >
      Nothing in the catalogue has all of them. Try removing a filter.
    </EmptyState>
  );
};

type RecipeCountProps = { count: number };

// A status message, so a screen reader hears the new count after each change; with none, the empty state says so.
const RecipeCount = ({ count }: RecipeCountProps) => (
  <p role="status" className={count === 0 ? 'sr-only' : 'text-muted text-small'}>
    {`${count} ${count === 1 ? 'recipe' : 'recipes'}`}
  </p>
);

// The first row is in view as the list opens and holds its largest paint, so its photos skip lazy loading.
// Four is the longest row, on a laptop.
const FIRST_ROW_LENGTH = 4;

type RecipesProps = { recipes: RecipeSummary[]; query: RecipeQuery; onClearFilters: () => void };

const Recipes = ({ recipes, query, onClearFilters }: RecipesProps) => {
  if (recipes.length === 0) {
    return <NoRecipes query={query} onClearFilters={onClearFilters} />;
  }
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 sm:gap-x-6 lg:grid-cols-4 lg:gap-x-9 lg:gap-y-11 large-text:grid-cols-1">
      {recipes.map((recipe, index) => (
        <RecipeItem
          key={recipe.id}
          recipe={recipe}
          lean={index % 2 === 0 ? 'left' : 'right'}
          eager={index < FIRST_ROW_LENGTH}
        />
      ))}
    </ul>
  );
};

type RecipesResult = ReturnType<typeof useRecipes>;

// A refetch resets a never-successful query to pending but leaves errorUpdatedAt, so the error stays up through its
// retry, even when an earlier query's list would otherwise stand in as placeholder data. A list already shown stays
// up if a background refetch fails.
const shownRecipes = ({ data, isPlaceholderData, errorUpdatedAt }: RecipesResult) =>
  data !== undefined && !(isPlaceholderData && errorUpdatedAt > 0) ? data : undefined;

type RecipeListProps = { result: RecipesResult; onClearFilters: () => void };

const RecipeList = ({ result, onClearFilters }: RecipeListProps) => {
  const shown = shownRecipes(result);
  if (shown !== undefined) {
    return <Recipes recipes={shown.recipes} query={shown.query} onClearFilters={onClearFilters} />;
  }
  if (result.errorUpdatedAt > 0) {
    return (
      <ErrorWithRetry title="Couldn't load recipes" onRetry={result.refetch}>
        Check your connection, then try again.
      </ErrorWithRetry>
    );
  }
  return <Loading>Finding recipes…</Loading>;
};

const FILTER_PANEL_ID = 'recipe-filters';

// The sheet's foot names the list it goes back to; while that list loads, it can't say how many.
const showRecipesLabel = ({ data, isPlaceholderData }: RecipesResult) => {
  if (data === undefined || isPlaceholderData) {
    return 'Show recipes';
  }
  const count = data.recipes.length;
  return `Show ${count} ${count === 1 ? 'recipe' : 'recipes'}`;
};

type FiltersSheetProps = {
  filters: RecipeFilters;
  onChange: (filters: RecipeFilters) => void;
  filterCount: number;
  result: RecipesResult;
  buttonRef: RefObject<HTMLButtonElement | null>;
};

// Its own component, so whether it's open goes with it when the layout turns to the laptop column.
const FiltersSheet = ({ filters, onChange, filterCount, result, buttonRef }: FiltersSheetProps) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <Sheet
      title="Filters"
      open={isOpen}
      onOpenChange={setIsOpen}
      trigger={
        <Button ref={buttonRef} variant="secondary">
          <SlidersHorizontal aria-hidden="true" />
          {filterCount === 0 ? 'Filters' : `Filters · ${filterCount}`}
        </Button>
      }
    >
      <RecipeFilterPanel id={FILTER_PANEL_ID} filters={filters} onChange={onChange} tilted={false} />
      <Button className="w-full" onClick={() => setIsOpen(false)}>
        {showRecipesLabel(result)}
      </Button>
    </Sheet>
  );
};

export const RecipesPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  // The top bar's field writes q (useRecipeSearch); the list searches once the typing pauses.
  const searchTerm = toSearchTerm(useDebouncedValue(searchParams.get('q') ?? '', SEARCH_DELAY_MS));

  // The chips change the address at once, so the address is the filters' only state.
  const filters = readFilters(searchParams);
  const changeFilters = useCallback(
    (next: RecipeFilters) => {
      // Each change builds on the filters last rendered, so it renders at once, not in a transition a second tap could overtake.
      setSearchParams((params) => writeFilters(params, next), { replace: true, flushSync: true });
    },
    [setSearchParams]
  );

  const query = { searchTerm, filters };
  // RecipeList's query too, so the count and the sheet's button need no request of their own.
  const result = useRecipes(query);
  const shown = shownRecipes(result);
  const isLaptop = useMediaQuery(isLaptopQuery);

  // One of them is on screen: the Filters button below a laptop, the filters' column on one.
  const filtersButton = useRef<HTMLButtonElement>(null);
  const filtersColumn = useRef<HTMLElement>(null);
  // The pressed chip or "Clear filters" disappears, so focus goes back to where the filters are.
  const removeFilters = useCallback(
    (next: RecipeFilters) => {
      changeFilters(next);
      (filtersButton.current ?? filtersColumn.current)?.focus();
    },
    [changeFilters]
  );
  const clearFilters = useCallback(() => removeFilters(noFilters), [removeFilters]);

  const shownFilters = useActiveFilters(filters);
  const filterCount = countActiveFilters(shownFilters);
  const activeFilters = <ActiveFilters activeFilters={shownFilters} onChange={removeFilters} />;
  const recipeList = <RecipeList result={result} onClearFilters={clearFilters} />;

  return (
    <Page>
      <title>Recipes · Tastebook</title>
      <div className="flex flex-col gap-3.5">
        <h1>
          What shall we <Squiggle emphasis>cook</Squiggle> tonight?
        </h1>
        {/* For everyone: signed out, the form sends you through sign-in and back. */}
        <Button asChild variant="secondary" className="self-start">
          <Link to="/recipes/new">
            <Plus aria-hidden="true" strokeWidth={2.5} />
            Add a recipe
          </Link>
        </Button>
        {shown !== undefined && <RecipeCount count={shown.recipes.length} />}
      </div>
      {isLaptop ? (
        <div className="grid grid-cols-[16.25rem_minmax(0,1fr)] items-start gap-12">
          <aside aria-label="Filters" tabIndex={-1} ref={filtersColumn}>
            <RecipeFilterPanel id={FILTER_PANEL_ID} filters={filters} onChange={changeFilters} tilted />
          </aside>
          <div className="flex flex-col gap-6">
            {activeFilters}
            {recipeList}
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <FiltersSheet
              filters={filters}
              onChange={changeFilters}
              filterCount={filterCount}
              result={result}
              buttonRef={filtersButton}
            />
            {activeFilters}
          </div>
          {recipeList}
        </>
      )}
    </Page>
  );
};
