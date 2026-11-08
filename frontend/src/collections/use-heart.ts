import { toast } from '../dino';
import { FAVOURITES, useSaveRecipe } from './lists-api';
import { useStillSignedIn } from './still-signed-in';
import { useRemoval } from './use-removal';

const SAVE_FAILED = "Couldn't save. Check your connection.";

// What every heart does when pressed, with its toasts: on a recipe's page, on a card and on Favourites' page.
export const useHeart = () => {
  const save = useSaveRecipe();
  const remove = useRemoval(FAVOURITES, 'Favourites');
  const { stillSignedIn, signIn } = useStillSignedIn();

  const add = async (slug: string, saidFirst = ''): Promise<void> => {
    const failed = () => toast.error(SAVE_FAILED, { action: { label: 'Try again', onClick: () => void add(slug) } });
    try {
      const result = await save.mutateAsync(slug);
      if (result.kind === 'saved') {
        const { saved } = result;
        // Undoing a save just takes it out again.
        toast(`${saidFirst}Saved to Favourites`, { action: { label: 'Undo', onClick: () => void remove(saved) } });
      } else if (result.kind === 'gone') {
        toast.error("This recipe isn't available any more.");
      } else if (await stillSignedIn(slug)) {
        failed();
      }
    } catch {
      failed();
    }
  };

  return { add, remove, signIn };
};
