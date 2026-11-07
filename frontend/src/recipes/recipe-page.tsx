import { ChevronLeft } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';

import type { components } from '../api/schema';
import {
  ErrorWithRetry,
  FilterChip,
  Loading,
  Page,
  Polaroid,
  RecipePhoto,
  SegmentedControl,
  ServingsStepper,
  StickeredPhoto
} from '../dino';
import { useSession } from '../households';
import type { UnitSystem } from './convert';
import { dietTagLabels, stickerTags } from './diet-tags';
import {
  canCrossDimensions,
  canShowOriginal,
  hasIngredients,
  type Reading,
  RecipeIngredients
} from './recipe-ingredients';
import { RecipeIntro } from './recipe-intro';
import { RecipeMethod } from './recipe-method';
import { RecipePhotoCredit } from './recipe-photo-credit';
import { useRecipe } from './recipes-api';

type Recipe = components['schemas']['Recipe'];

type RecipeProps = { recipe: Recipe };

const unitSystems: { value: UnitSystem; label: string }[] = [
  { value: 'metric', label: 'Metric' },
  { value: 'us', label: 'US' }
];

const crossingLabels: Record<UnitSystem, string> = { metric: 'Cups to grams', us: 'Grams to cups' };

// The model allows up to 32767; past this a stepper clicked one at a time stops being a way to get there.
const maxServings = 99;

type RecipeControlsProps = {
  recipe: Recipe;
  original: number;
  reading: Reading;
  scaledTo: number;
  onScaledToChange: (scaledTo: number) => void;
  onSystemChange: (system: UnitSystem) => void;
  onShowOriginalChange: (showOriginal: boolean) => void;
  onCrossesDimensionsChange: (crossesDimensions: boolean) => void;
};

const RecipeControls = ({
  recipe,
  original,
  reading,
  scaledTo,
  onScaledToChange,
  onSystemChange,
  onShowOriginalChange,
  onCrossesDimensionsChange
}: RecipeControlsProps) => {
  const canScale = hasIngredients(recipe) && (recipe.servings !== null || recipe.yield_amount !== null);
  const canConvert = hasIngredients(recipe) || recipe.steps.length > 0;
  const crossingShown = canCrossDimensions(recipe, reading);
  const showOriginalShown = canShowOriginal(recipe, reading);
  if (!canScale && !canConvert && !showOriginalShown) {
    return null;
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {canScale && (
        <ServingsStepper
          value={scaledTo}
          min={1}
          max={Math.max(maxServings, original)}
          onValueChange={onScaledToChange}
          yieldUnit={recipe.servings === null ? recipe.yield_unit : undefined}
        />
      )}
      {canConvert && (
        <SegmentedControl label="Units" options={unitSystems} value={reading.system} onValueChange={onSystemChange} />
      )}
      {crossingShown && (
        <FilterChip pressed={reading.crossesDimensions} onPressedChange={onCrossesDimensionsChange}>
          {crossingLabels[reading.system]}
        </FilterChip>
      )}
      {showOriginalShown && (
        <FilterChip pressed={reading.showOriginal} onPressedChange={onShowOriginalChange}>
          Show original
        </FilterChip>
      )}
    </div>
  );
};

// The servings, Cups to grams and Show original aren't remembered, and the unit system opens as the account's, so every
// recipe opens as written. The DOM keeps the phone's order at every width, so reading and focus order match; a laptop's
// grid places the photo and ingredients on the left (5 parts) and the rest on the right (7).
const RecipeBody = ({ recipe, preferredSystem }: RecipeDetailsProps) => {
  // The database holds exactly one of servings and a yield.
  const original = recipe.servings ?? recipe.yield_amount ?? 1;
  const [scaledTo, setScaledTo] = useState(original);
  const [chosenSystem, setChosenSystem] = useState<UnitSystem>();
  const system = chosenSystem ?? preferredSystem;
  const [showOriginal, setShowOriginal] = useState(false);
  // Choosing a unit system asks for the amounts in it, not the original.
  const chooseSystem = (chosen: UnitSystem) => {
    setChosenSystem(chosen);
    setShowOriginal(false);
  };
  const [crossesDimensions, setCrossesDimensions] = useState(true);
  // Turning Cups to grams on or off asks for the amounts, as choosing a unit system does.
  const chooseCrossing = (crosses: boolean) => {
    setCrossesDimensions(crosses);
    setShowOriginal(false);
  };
  const reading = { factor: scaledTo / original, system, showOriginal, crossesDimensions };
  return (
    <div className="grid grid-cols-1 gap-8 max-lg:max-w-2xl lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:grid-rows-[auto_1fr] lg:gap-x-16 lg:gap-y-10">
      <div className="lg:col-start-1 lg:row-start-1 lg:px-6 lg:pt-2">
        <StickeredPhoto
          stickers={stickerTags(recipe.diet_tags).map((tag) => ({ label: dietTagLabels[tag], kind: 'diet' }))}
        >
          <Polaroid frame="large" lean="left" tape>
            <RecipePhoto
              shape="hero"
              photo={recipe.photo}
              recipeId={recipe.id}
              alt={recipe.title}
              // Only a Commons photo has a credit; a household's own photo shows bare in its frame.
              caption={recipe.photo?.credit ? <RecipePhotoCredit credit={recipe.photo.credit} /> : undefined}
            />
          </Polaroid>
        </StickeredPhoto>
      </div>
      <div className="flex flex-col gap-6 lg:col-start-2 lg:row-start-1">
        <RecipeIntro recipe={recipe} />
        <RecipeControls
          recipe={recipe}
          original={original}
          reading={reading}
          scaledTo={scaledTo}
          onScaledToChange={setScaledTo}
          onSystemChange={chooseSystem}
          onShowOriginalChange={setShowOriginal}
          onCrossesDimensionsChange={chooseCrossing}
        />
      </div>
      <RecipeIngredients recipe={recipe} reading={reading} />
      <RecipeMethod recipe={recipe} reading={reading} />
    </div>
  );
};

type RecipeDetailsProps = RecipeProps & { preferredSystem: UnitSystem };

const RecipeDetails = ({ recipe, preferredSystem }: RecipeDetailsProps) => (
  <>
    {/* React 19 needs <title> to have a single string child. */}
    <title>{`${recipe.title} · Tastebook`}</title>
    {/* Keyed so another recipe starts at its own servings, in the account's units. */}
    <RecipeBody key={recipe.id} recipe={recipe} preferredSystem={preferredSystem} />
  </>
);

export const RecipeNotFound = () => (
  <>
    <title>Recipe not found · Tastebook</title>
    <h1>Recipe not found</h1>
    <p>This recipe doesn't exist or has been removed.</p>
  </>
);

const RecipeLoading = () => (
  <>
    <title>Recipe · Tastebook</title>
    <Loading>Opening the recipe…</Loading>
  </>
);

type RecipeUnavailableProps = {
  onRetry: () => Promise<unknown>;
};

const RecipeUnavailable = ({ onRetry }: RecipeUnavailableProps) => (
  <>
    <title>Recipe · Tastebook</title>
    <ErrorWithRetry title="Couldn't load the recipe" onRetry={onRetry}>
      Check your connection, then try again.
    </ErrorWithRetry>
  </>
);

// The account's unit system once the session has answered: metric signed out, or when the session can't be checked.
const usePreferredSystem = (): UnitSystem | undefined => {
  const { account, errorUpdatedAt } = useSession();
  if (account !== undefined) {
    return account?.unit_system ?? 'metric';
  }
  return errorUpdatedAt > 0 ? 'metric' : undefined;
};

type RecipeForSlugProps = { slug: string };

const RecipeForSlug = ({ slug }: RecipeForSlugProps) => {
  const { data, errorUpdatedAt, refetch } = useRecipe(slug);
  const preferredSystem = usePreferredSystem();
  if (data === null) {
    return <RecipeNotFound />;
  }
  // A recipe already shown stays up if a background refetch fails. It waits for the session, so a US account never
  // sees metric first.
  if (data !== undefined) {
    return preferredSystem === undefined ? (
      <RecipeLoading />
    ) : (
      <RecipeDetails recipe={data} preferredSystem={preferredSystem} />
    );
  }
  // A refetch resets a never-successful query to pending but leaves errorUpdatedAt, so the error stays up through its retry.
  if (errorUpdatedAt > 0) {
    return <RecipeUnavailable onRetry={refetch} />;
  }
  return <RecipeLoading />;
};

const RecipeContent = () => {
  const { slug } = useParams();
  // The route always supplies a slug; this only narrows the type.
  if (slug === undefined) {
    return <RecipeNotFound />;
  }
  return <RecipeForSlug slug={slug} />;
};

export const RecipePage = () => (
  <Page>
    <Link
      to="/recipes"
      className="inline-flex min-h-11 items-center gap-1 self-start text-label no-underline hover:underline"
    >
      <ChevronLeft aria-hidden="true" className="size-4.5" strokeWidth={2.5} />
      All recipes
    </Link>
    <RecipeContent />
  </Page>
);
