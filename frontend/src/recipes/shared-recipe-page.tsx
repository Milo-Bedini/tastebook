import { useParams } from 'react-router';

import { Page } from '../dino';
import { SharedRecipeIntro } from './recipe-intro';
import { RecipeBody, RecipeLoading, RecipeNotFound, RecipeUnavailable, usePreferredSystem } from './recipe-page';
import { useSharedRecipe } from './recipes-api';

const SharedRecipe = ({ token }: { token: string }) => {
  const { data, errorUpdatedAt, refetch } = useSharedRecipe(token);
  const preferredSystem = usePreferredSystem();
  // A link that's off, never was, or whose recipe went public or was deleted: the same words, so it gives nothing away.
  if (data === null) {
    return <RecipeNotFound />;
  }
  if (data !== undefined && preferredSystem !== undefined) {
    return (
      <>
        <title>{`${data.title} · Tastebook`}</title>
        <RecipeBody
          key={data.id}
          recipe={data}
          intro={<SharedRecipeIntro recipe={data} />}
          preferredSystem={preferredSystem}
        />
      </>
    );
  }
  if (data === undefined && errorUpdatedAt > 0) {
    return <RecipeUnavailable onRetry={refetch} />;
  }
  return <RecipeLoading />;
};

// Opened by anyone with the link, signed in or not, so it sits outside the name gate; search engines leave it out.
export const SharedRecipePage = () => {
  const { token } = useParams();
  return (
    <Page>
      <meta name="robots" content="noindex" />
      {token === undefined ? <RecipeNotFound /> : <SharedRecipe token={token} />}
    </Page>
  );
};
