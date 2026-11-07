import { useLocation, useNavigate } from 'react-router';

import { toast } from '../dino';
import { useSession } from '../households';
import { type SavedRecipe, useSaveRecipe, useUndoUnsave, useUnsave } from './lists-api';

// Signed out, a press goes through sign-in and comes back with save= on the address, which SaveOnReturn reads.
export const SAVE_PARAM = 'save';

const SAVE_FAILED = "Couldn't save. Check your connection.";
const UNSAVE_FAILED = "Couldn't remove it. Check your connection.";
const UNDO_FAILED = "Couldn't put it back. Check your connection.";

const signInPath = (pathname: string, search: string, slug?: string) => {
  const params = new URLSearchParams(search);
  params.delete(SAVE_PARAM);
  if (slug !== undefined) {
    params.set(SAVE_PARAM, slug);
  }
  const query = params.toString();
  return `/sign-in?next=${encodeURIComponent(`${pathname}${query === '' ? '' : `?${query}`}`)}`;
};

// What every heart does when pressed, with its toasts: on a recipe's page, on a card and on a list's page.
export const useHeart = () => {
  const save = useSaveRecipe();
  const unsave = useUnsave();
  const undo = useUndoUnsave();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const { refetch: checkSession } = useSession();

  // A 403 means signed out, unless the session says otherwise (a refused CSRF token), when it failed like any other.
  const stillSignedIn = async (slug?: string) => {
    const { data: account } = await checkSession();
    if (account === null) {
      await navigate(signInPath(pathname, search, slug));
      return false;
    }
    return true;
  };

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
        toast('Removed from Favourites', { action: { label: 'Undo', onClick: () => void putBack(result.undo) } });
      } else if (result.kind === 'signed-out' && (await stillSignedIn())) {
        failed();
      }
    } catch {
      failed();
    }
  };

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

  return {
    add,
    remove,
    signIn: (slug: string) => navigate(signInPath(pathname, search, slug)),
    saving: save.isPending,
    unsaving: unsave.isPending
  };
};
