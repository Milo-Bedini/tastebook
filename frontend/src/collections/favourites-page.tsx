import { ChevronLeft } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';

import {
  Button,
  EmptyState,
  ErrorWithRetry,
  FavouriteButton,
  Loading,
  Page,
  Squiggle,
  UnavailableRecipe
} from '../dino';
import { RecipeCard } from '../recipes';
import { type SavedRecipe, useFavourites } from './lists-api';
import { recipeCount } from './recipe-count';
import { SignedInOnly } from './signed-in-only';
import { useHeart } from './use-heart';

// The first row is in view as the list opens and holds its largest paint, so its photos skip lazy loading.
const FIRST_ROW_LENGTH = 4;

const takeFocus = (element: HTMLElement | null) => element?.focus();

// FavouriteButton keeps its button to itself, so focus reaches it through the span round it.
const focusHeart = (element: HTMLElement | null) => element?.querySelector('button')?.focus();

type SavedHeartProps = { saved: SavedRecipe; takesFocus: boolean; onUnsave: () => void };

// Every recipe on the page is saved, so its heart only unsaves; the card leaves at once.
const SavedHeart = ({ saved, takesFocus, onUnsave }: SavedHeartProps) => {
  const heart = useHeart();
  return (
    <span ref={takesFocus ? focusHeart : undefined} className="contents">
      <FavouriteButton
        label={`Favourite ${saved.recipe?.title ?? saved.title}`}
        saved
        onSavedChange={() => {
          onUnsave();
          void heart.remove(saved);
        }}
      />
    </span>
  );
};

type SavedItemProps = { saved: SavedRecipe; index: number; takesFocus: boolean; onUnsave: (index: number) => void };

const SavedItem = ({ saved, index, takesFocus, onUnsave }: SavedItemProps) => {
  const heart = <SavedHeart saved={saved} takesFocus={takesFocus} onUnsave={() => onUnsave(index)} />;
  if (saved.recipe === null) {
    return <UnavailableRecipe title={saved.title} action={heart} />;
  }
  return (
    <RecipeCard
      recipe={saved.recipe}
      lean={index % 2 === 0 ? 'left' : 'right'}
      eager={index < FIRST_ROW_LENGTH}
      openedFrom="favourites"
      action={heart}
    />
  );
};

type SavedRecipesProps = { savedRecipes: SavedRecipe[]; focusAt: number | null; onUnsave: (index: number) => void };

const SavedRecipes = ({ savedRecipes, focusAt, onUnsave }: SavedRecipesProps) => (
  <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 sm:gap-x-6 lg:grid-cols-4 lg:gap-x-9 lg:gap-y-11 large-text:grid-cols-1">
    {savedRecipes.map((saved, index) => (
      <SavedItem key={saved.id} saved={saved} index={index} takesFocus={focusAt === index} onUnsave={onUnsave} />
    ))}
  </ul>
);

const NothingSaved = () => (
  <EmptyState
    title="Nothing saved yet"
    action={
      <Button asChild variant="secondary">
        <Link to="/recipes">Browse recipes</Link>
      </Button>
    }
    doodle="find one you love"
  >
    Press the heart on any recipe and it lands here, ready for when you need it.
  </EmptyState>
);

const Favourites = () => {
  const { data, errorUpdatedAt, refetch } = useFavourites();
  // Where the last unsaved card was: the card now there takes focus, or the heading when none is left.
  const [focusAt, setFocusAt] = useState<number | null>(null);
  if (data !== undefined) {
    const count = data.saved_recipes.length;
    return (
      <>
        <div className="flex flex-col gap-2">
          <h1 ref={focusAt !== null && count === 0 ? takeFocus : undefined} tabIndex={-1}>
            <Squiggle emphasis>{data.name}</Squiggle>
          </h1>
          {/* A status message, so a screen reader hears the count drop as a card leaves. */}
          <p role="status" className={count === 0 ? 'sr-only' : 'text-muted text-small'}>
            {recipeCount(count)}
          </p>
        </div>
        {count === 0 ? (
          <NothingSaved />
        ) : (
          <SavedRecipes savedRecipes={data.saved_recipes} focusAt={focusAt} onUnsave={setFocusAt} />
        )}
      </>
    );
  }
  const heading = (
    <h1>
      <Squiggle emphasis>Favourites</Squiggle>
    </h1>
  );
  if (errorUpdatedAt > 0) {
    return (
      <>
        {heading}
        <ErrorWithRetry title="Couldn't load your favourites" onRetry={refetch}>
          Check your connection, then try again.
        </ErrorWithRetry>
      </>
    );
  }
  return (
    <>
      {heading}
      <Loading>Finding your favourites…</Loading>
    </>
  );
};

export const FavouritesPage = () => (
  <Page>
    <title>Favourites · Tastebook</title>
    <Link
      to="/lists"
      className="inline-flex min-h-11 items-center gap-1 self-start text-label no-underline hover:underline"
    >
      <ChevronLeft aria-hidden="true" className="size-4.5" strokeWidth={2.5} />
      All lists
    </Link>
    <SignedInOnly path="/lists/favourites">
      <Favourites />
    </SignedInOnly>
  </Page>
);
