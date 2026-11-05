import { Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router';

import type { components } from '../api/schema';
import { Button, ConfirmDialog, toast } from '../dino';
import { useSession } from '../households';
import { deletionWarning } from './deletion-warning';
import { useDeleteRecipe } from './recipes-api';

type Recipe = components['schemas']['Recipe'];

export const DeleteRecipe = ({ recipe }: { recipe: Recipe }) => {
  const deleteRecipe = useDeleteRecipe(recipe.slug);
  const navigate = useNavigate();
  const { refetch: checkSession } = useSession();
  const failed = `Couldn't delete ${recipe.title}. Check your connection and try again.`;

  const remove = async () => {
    try {
      const result = await deleteRecipe.mutateAsync();
      if (result.kind === 'deleted') {
        toast.success(`Deleted ${recipe.title}`);
        await navigate('/recipes', { replace: true });
        return;
      }
      if (result.kind === 'gone') {
        toast.info(`${recipe.title} has already been deleted, or you can't delete it any more.`);
        await navigate('/recipes', { replace: true });
        return;
      }
      const { data: account } = await checkSession();
      if (account === null) {
        await navigate(`/sign-in?next=${encodeURIComponent(`/recipes/${recipe.slug}`)}`);
        return;
      }
      // Still signed in (a refused CSRF token, or the check failing), so nothing else says it wasn't deleted.
      toast.error(failed);
    } catch {
      toast.error(failed);
    }
  };

  return (
    <ConfirmDialog
      trigger={
        <Button variant="secondary">
          <Trash2 aria-hidden="true" strokeWidth={2.5} />
          Delete recipe
        </Button>
      }
      pending={deleteRecipe.isPending}
      pendingLabel="Deleting…"
      title="Delete this recipe?"
      description={deletionWarning(recipe)}
      confirmLabel="Delete recipe"
      onConfirm={remove}
    />
  );
};
