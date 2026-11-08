import { toast } from '../dino';
import { type ListAddress, type SavedRecipe, useUndoUnsave, useUnsave } from './lists-api';
import { useStillSignedIn } from './still-signed-in';

const UNSAVE_FAILED = "Couldn't remove it. Check your connection.";
const UNDO_FAILED = "Couldn't put it back. Check your connection.";

// Takes a recipe out of a list at once, with an Undo that puts it back in its place: a heart on Favourites, Remove on
// any other list.
export const useRemoval = (address: ListAddress, listName: string) => {
  const unsave = useUnsave(address);
  const undo = useUndoUnsave(address);
  const { stillSignedIn } = useStillSignedIn();

  const putBack = async (token: string): Promise<void> => {
    const failed = () =>
      toast.error(UNDO_FAILED, { action: { label: 'Try again', onClick: () => void putBack(token) } });
    try {
      const result = await undo.mutateAsync(token);
      if (result.kind === 'expired') {
        toast.error("That can't be undone any more.");
      } else if (result.kind === 'signed-out' && (await stillSignedIn())) {
        failed();
      }
    } catch {
      failed();
    }
  };

  const remove = async (saved: SavedRecipe): Promise<void> => {
    const failed = () =>
      toast.error(UNSAVE_FAILED, { action: { label: 'Try again', onClick: () => void remove(saved) } });
    try {
      const result = await unsave.mutateAsync(saved);
      if (result.kind === 'unsaved') {
        toast(`Removed from ${listName}`, { action: { label: 'Undo', onClick: () => void putBack(result.undo) } });
      } else if (result.kind === 'signed-out' && (await stillSignedIn())) {
        failed();
      }
    } catch {
      failed();
    }
  };

  return remove;
};
