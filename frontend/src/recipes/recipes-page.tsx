import { Plus, SlidersHorizontal } from 'lucide-react';
import type { RefObject } from 'react';
import { useCallback, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router';

import type { components } from '../api/schema';
import { Button, EmptyState, ErrorWithRetry, Loading, Page, Pagination, Sheet, Spinner, Squiggle } from '../dino';
import { ActiveFilters, countActiveFilters, useActiveFilters } from './active-filters';
import { Favourite, FavouriteHearts } from './favourite-slot';
import { RecipeCard } from './recipe-card';
import { RecipeFilterPanel } from './recipe-filter-panel';
import type { RecipeFilters } from './recipe-filters';
import { hasFilters, noFilters, readFilters, writeFilters } from './recipe-filters';
import type { RecipeListing, RecipeQuery } from './recipes-api';
import { RECIPES_PAGE_SIZE, useRecipes } from './recipes-api';
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

type Listed = Extract<RecipeListing, { recipes: RecipeSummary[] }>;

const pageCountOf = ({ count }: Listed) => Math.ceil(count / RECIPES_PAGE_SIZE);

// Which recipes are on screen out of every match ("25–48 of 137 recipes"); with one page, how many there are.
const countLine = (listed: Listed) => {
  const { count, recipes, query } = listed;
  const noun = count === 1 ? 'recipe' : 'recipes';
  if (pageCountOf(listed) <= 1) {
    return `${count} ${noun}`;
  }
  const first = (query.page - 1) * RECIPES_PAGE_SIZE + 1;
  return `${first}–${first + recipes.length - 1} of ${count} ${noun}`;
};

type RecipeCountProps = { listed: Listed; turningTo: number | null };

// A status message, so a screen reader hears the new count after each change; with none, the empty state says so.
// While another page of the same list loads, the line keeps the page shown and says so after half a second.
const RecipeCount = ({ listed, turningTo }: RecipeCountProps) => (
  <p role="status" className={listed.count === 0 ? 'sr-only' : 'grid text-muted text-small tabular-nums'}>
    <span className={turningTo === null ? undefined : 'col-start-1 row-start-1 animate-conceal'}>
      {countLine(listed)}
    </span>
    {turningTo !== null && (
      <span className="col-start-1 row-start-1 flex animate-reveal items-center gap-1.5">
        <Spinner className="size-4" />
        {`Finding page ${turningTo}…`}
      </span>
    )}
  </p>
);

// The first row is in view as the list opens and holds its largest paint, so its photos skip lazy loading.
// Four is the longest row, on a laptop.
const FIRST_ROW_LENGTH = 4;

type RecipesProps = { listed: Listed; onClearFilters: () => void; pageAddress: (page: number) => string };

// The pager's links ask the page they open to take focus to its heading.
const pagerState = { focus: 'heading' };

const Recipes = ({ listed, onClearFilters, pageAddress }: RecipesProps) => {
  const { recipes, query } = listed;
  if (recipes.length === 0) {
    return <NoRecipes query={query} onClearFilters={onClearFilters} />;
  }
  return (
    <div className="flex flex-col gap-8 lg:gap-11">
      <FavouriteHearts>
        <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 sm:gap-x-6 lg:grid-cols-4 lg:gap-x-9 lg:gap-y-11 large-text:grid-cols-1">
          {recipes.map((recipe, index) => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              lean={index % 2 === 0 ? 'left' : 'right'}
              eager={index < FIRST_ROW_LENGTH}
              action={<Favourite recipe={recipe} label={`Favourite ${recipe.title}`} />}
            />
          ))}
        </ul>
      </FavouriteHearts>
      <Pagination page={query.page} pageCount={pageCountOf(listed)} to={pageAddress} state={pagerState} />
    </div>
  );
};

type RecipesResult = ReturnType<typeof useRecipes>;

// A refetch resets a never-successful query to pending but leaves errorUpdatedAt, so the error stays up through its
// retry, even when an earlier query's list would otherwise stand in as placeholder data. A list already shown stays
// up if a background refetch fails. A page the list hasn't got shows nothing while the address goes back to the first.
const shownRecipes = ({ data, isPlaceholderData, errorUpdatedAt }: RecipesResult): Listed | undefined =>
  data !== undefined && data.recipes !== null && !(isPlaceholderData && errorUpdatedAt > 0) ? data : undefined;

type RecipeListProps = { result: RecipesResult; onClearFilters: () => void; pageAddress: (page: number) => string };

const RecipeList = ({ result, onClearFilters, pageAddress }: RecipeListProps) => {
  const shown = shownRecipes(result);
  if (shown !== undefined) {
    return <Recipes listed={shown} onClearFilters={onClearFilters} pageAddress={pageAddress} />;
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
  if (data === undefined || data.recipes === null || isPlaceholderData) {
    return 'Show recipes';
  }
  const { count } = data;
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

// A recipe a report hid sends its reporter back here, and the heading takes the focus the sheet had.
const asksForHeading = (state: unknown) =>
  typeof state === 'object' && state !== null && 'focus' in state && state.focus === 'heading';

// The pager's links leave the reader at the list's foot, so the page goes back to its top as the heading takes focus.
const takeFocus = (element: HTMLElement | null) => {
  if (element !== null) {
    window.scrollTo({ top: 0 });
    element.focus({ preventScroll: true });
  }
};

// The address holds the page; anything but a whole number from 2 is the first.
const readPage = (params: URLSearchParams) => {
  const page = Number(params.get('page'));
  return Number.isInteger(page) && page > 1 ? page : 1;
};

const PAGE_PARAM = 'page';

// Another search or filter is another list, so it starts again at its first page.
const withoutPage = (params: URLSearchParams) => {
  params.delete(PAGE_PARAM);
  return params;
};

// Two queries for the same list, perhaps on different pages.
const sameList = (one: RecipeQuery, other: RecipeQuery) =>
  JSON.stringify({ ...one, page: 0 }) === JSON.stringify({ ...other, page: 0 });

export const RecipesPage = () => {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  // The top bar's field writes q (useRecipeSearch); the list searches once the typing pauses.
  const searchTerm = toSearchTerm(useDebouncedValue(searchParams.get('q') ?? '', SEARCH_DELAY_MS));

  // The chips change the address at once, so the address is the filters' only state.
  const filters = readFilters(searchParams);
  const changeFilters = useCallback(
    (next: RecipeFilters) => {
      // Each change builds on the filters last rendered, so it renders at once, not in a transition a second tap could overtake.
      setSearchParams((params) => withoutPage(writeFilters(params, next)), { replace: true, flushSync: true });
    },
    [setSearchParams]
  );

  const page = readPage(searchParams);
  const pageAddress = (to: number) => {
    const params = new URLSearchParams(searchParams);
    if (to === 1) {
      params.delete(PAGE_PARAM);
    } else {
      params.set(PAGE_PARAM, String(to));
    }
    const search = params.toString();
    return search === '' ? location.pathname : `${location.pathname}?${search}`;
  };

  const query = { searchTerm, filters, page };
  // RecipeList's query too, so the count and the sheet's button need no request of their own.
  const result = useRecipes(query);
  const shown = shownRecipes(result);
  const turningTo = shown !== undefined && result.isPlaceholderData && sameList(shown.query, query) ? page : null;
  const isPastTheEnd = result.data?.recipes === null && !result.isPlaceholderData;
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
  const recipeList = <RecipeList result={result} onClearFilters={clearFilters} pageAddress={pageAddress} />;

  return (
    <Page>
      <title>Recipes · Tastebook</title>
      {/* An old or mistyped link past the last page shows the first, in its place in the history. */}
      {isPastTheEnd && <Navigate to={pageAddress(1)} replace />}
      <div className="flex flex-col gap-3.5">
        {/* Keyed by the history entry, so each page the pager opens takes focus again. */}
        <h1 key={location.key} ref={asksForHeading(location.state) ? takeFocus : undefined} tabIndex={-1}>
          What shall we <Squiggle emphasis>cook</Squiggle> tonight?
        </h1>
        {/* For everyone: signed out, the form sends you through sign-in and back. */}
        <Button asChild variant="secondary" className="self-start">
          <Link to="/recipes/new">
            <Plus aria-hidden="true" strokeWidth={2.5} />
            Add a recipe
          </Link>
        </Button>
        {shown !== undefined && <RecipeCount listed={shown} turningTo={turningTo} />}
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
