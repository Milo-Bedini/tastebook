import { ChevronLeft } from 'lucide-react';
import { Link, Navigate, useParams } from 'react-router';

import type { components } from '../api/schema';
import { ErrorWithRetry, Loading, Page, Squiggle } from '../dino';
import { useSession } from '../households';
import { RecipeForm } from './recipe-form';
import { useEditRecipe } from './recipe-form-api';
import { RecipeNotFound } from './recipe-page';
import { useRecipe } from './recipes-api';

type Recipe = components['schemas']['Recipe'];

type EditRecipeFormProps = { recipe: Recipe };

const EditRecipeForm = ({ recipe }: EditRecipeFormProps) => {
  const editRecipe = useEditRecipe(recipe.slug);
  return (
    <div className="flex w-full max-w-160 flex-col gap-8">
      <title>{`Edit ${recipe.title} · Tastebook`}</title>
      <div className="flex flex-col gap-3">
        <h1>
          Edit <Squiggle emphasis>recipe</Squiggle>
        </h1>
        <p className="text-muted">Everyone in your household sees your changes.</p>
      </div>
      <RecipeForm
        key={recipe.id}
        recipe={recipe}
        submitLabel="Save changes"
        isSaving={editRecipe.isPending}
        onSave={editRecipe.mutateAsync}
      />
    </div>
  );
};

const EditRecipeLoading = () => (
  <>
    <title>Edit recipe · Tastebook</title>
    <Loading>Opening the recipe…</Loading>
  </>
);

type RecipeToEditProps = { slug: string };

const RecipeToEdit = ({ slug }: RecipeToEditProps) => {
  const { data, errorUpdatedAt, refetch } = useRecipe(slug);
  if (data === null) {
    return <RecipeNotFound />;
  }
  // Someone who may not edit it (any catalogue recipe, or a public one another member wrote) sees the recipe instead.
  if (data?.can_edit === false) {
    return <Navigate to={`/recipes/${slug}`} replace />;
  }
  if (data !== undefined) {
    return <EditRecipeForm recipe={data} />;
  }
  // A refetch resets a never-successful query to pending but leaves errorUpdatedAt, so the error stays up through its retry.
  if (errorUpdatedAt > 0) {
    return (
      <>
        <title>Edit recipe · Tastebook</title>
        <ErrorWithRetry title="Couldn't load the recipe" onRetry={refetch}>
          Check your connection, then try again.
        </ErrorWithRetry>
      </>
    );
  }
  return <EditRecipeLoading />;
};

type EditRecipeContentProps = { slug: string };

const EditRecipeContent = ({ slug }: EditRecipeContentProps) => {
  const { account, errorUpdatedAt, refetch } = useSession();
  if (account === null) {
    return <Navigate to={`/sign-in?next=${encodeURIComponent(`/recipes/${slug}/edit`)}`} replace />;
  }
  if (account !== undefined) {
    return <RecipeToEdit slug={slug} />;
  }
  if (errorUpdatedAt > 0) {
    return (
      <>
        <title>Edit recipe · Tastebook</title>
        <ErrorWithRetry title="Couldn't check you're signed in" onRetry={refetch}>
          Check your connection, then try again.
        </ErrorWithRetry>
      </>
    );
  }
  return <EditRecipeLoading />;
};

export const EditRecipePage = () => {
  // The route always supplies a slug.
  const { slug = '' } = useParams();
  return (
    <Page>
      <Link
        to={`/recipes/${slug}`}
        className="inline-flex min-h-11 items-center gap-1 self-start text-label no-underline hover:underline"
      >
        <ChevronLeft aria-hidden="true" className="size-4.5" strokeWidth={2.5} />
        Back to the recipe
      </Link>
      <EditRecipeContent slug={slug} />
    </Page>
  );
};
