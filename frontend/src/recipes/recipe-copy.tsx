import { Copy } from 'lucide-react';
import { useNavigate } from 'react-router';

import type { components } from '../api/schema';
import { Button, toast } from '../dino';
import { useSession } from '../households';
import { useCopyRecipe } from './recipes-api';

type Recipe = components['schemas']['Recipe'];

// Says the copy's page was opened by making it, so its title takes the focus the button had.
export const MADE_COPY = 'madeCopy';

export const CopyRecipe = ({ recipe }: { recipe: Recipe }) => {
  const copyRecipe = useCopyRecipe(recipe.slug);
  const navigate = useNavigate();
  const { refetch: checkSession } = useSession();
  const failed = `Couldn't copy ${recipe.title}. Check your connection and try again.`;

  const makeCopy = async () => {
    try {
      const result = await copyRecipe.mutateAsync();
      if (result.kind === 'copied') {
        toast.success(`Made a copy of ${recipe.title}`);
        await navigate(`/recipes/${result.recipe.slug}`, { state: { [MADE_COPY]: true } });
        return;
      }
      if (result.kind === 'gone') {
        toast.info(`${recipe.title} has been deleted, or you can't see it any more.`);
        return;
      }
      const { data: account } = await checkSession();
      if (account === null) {
        await navigate(`/sign-in?next=${encodeURIComponent(`/recipes/${recipe.slug}`)}`);
        return;
      }
      // Still signed in (a refused CSRF token, or the check failing), so nothing else says it wasn't copied.
      toast.error(failed);
    } catch {
      toast.error(failed);
    }
  };

  return (
    <Button variant="secondary" loading={copyRecipe.isPending} loadingLabel="Copying…" onClick={() => void makeCopy()}>
      <Copy aria-hidden="true" strokeWidth={2.5} />
      Make a copy
    </Button>
  );
};
