import { Navigate } from 'react-router';

import { ErrorWithRetry, Loading, Page, Squiggle } from '../dino';
import { useSession } from '../households';
import { RecipeForm } from './recipe-form';
import { useAddRecipe } from './recipe-form-api';

const NewRecipeContent = () => {
  const { account, errorUpdatedAt, refetch } = useSession();
  const addRecipe = useAddRecipe();
  if (account === null) {
    return <Navigate to="/sign-in?next=%2Frecipes%2Fnew" replace />;
  }
  if (account !== undefined) {
    return (
      <div className="flex w-full max-w-160 flex-col gap-8">
        <div className="flex flex-col gap-3">
          <h1>
            Add a <Squiggle emphasis>recipe</Squiggle>
          </h1>
          <p className="text-muted">Only the title is needed. Its page lists whatever's still missing.</p>
        </div>
        <RecipeForm submitLabel="Save recipe" isSaving={addRecipe.isPending} onSave={addRecipe.mutateAsync} />
      </div>
    );
  }
  // A refetch resets a never-successful query to pending but leaves errorUpdatedAt, so the error stays up through its retry.
  if (errorUpdatedAt > 0) {
    return (
      <ErrorWithRetry title="Couldn't check you're signed in" onRetry={refetch}>
        Check your connection, then try again.
      </ErrorWithRetry>
    );
  }
  return <Loading>Opening the form…</Loading>;
};

export const NewRecipePage = () => (
  <Page>
    <title>Add a recipe · Tastebook</title>
    <NewRecipeContent />
  </Page>
);
