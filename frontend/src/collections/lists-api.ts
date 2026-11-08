import { type QueryClient, useMutation, useMutationState, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '../api/client';
import type { components } from '../api/schema';

export type SavedRecipe = components['schemas']['SavedRecipe'];
export type SavedList = components['schemas']['SavedList'];

const LISTS_KEY = ['collections', 'lists'];
const FAVOURITES_KEY = ['collections', 'favourites'];
const SAVE_KEY = ['collections', 'save'];
const UNSAVE_KEY = ['collections', 'unsave'];

export const useLists = () =>
  useQuery({
    queryKey: LISTS_KEY,
    queryFn: async () => {
      const { data, error } = await api.GET('/api/lists/');
      if (error || !data) {
        throw new Error('Lists request failed');
      }
      return data;
    }
  });

// Only signed in: signed out there are no lists, and every heart shows unsaved.
export const useFavourites = ({ enabled = true }: { enabled?: boolean } = {}) =>
  useQuery({
    queryKey: FAVOURITES_KEY,
    queryFn: async () => {
      const { data, error } = await api.GET('/api/lists/favourites/');
      if (error || !data) {
        throw new Error('Favourites request failed');
      }
      return data;
    },
    enabled
  });

const newestFirst = (a: SavedRecipe, b: SavedRecipe) =>
  b.saved_at === a.saved_at ? b.id - a.id : b.saved_at.localeCompare(a.saved_at);

// Puts a saved recipe in its place: newest saved first, as the API lists them.
const placed = (saved: SavedRecipe) => (list: SavedList | undefined) =>
  list === undefined
    ? undefined
    : { ...list, saved_recipes: [...list.saved_recipes.filter(({ id }) => id !== saved.id), saved].sort(newestFirst) };

const without = (savedId: number) => (list: SavedList | undefined) =>
  list === undefined ? undefined : { ...list, saved_recipes: list.saved_recipes.filter(({ id }) => id !== savedId) };

// The Lists page's count and fan follow Favourites, so it's asked again after every change.
const listsChanged = (queryClient: QueryClient) => queryClient.invalidateQueries({ queryKey: LISTS_KEY });

export type Saving = { kind: 'saved'; saved: SavedRecipe } | { kind: 'signed-out' } | { kind: 'gone' };

export const useSaveRecipe = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: SAVE_KEY,
    mutationFn: async (slug: string): Promise<Saving> => {
      const { data, response } = await api.POST('/api/lists/favourites/saved/', { body: { recipe: slug } });
      if (data !== undefined) {
        return { kind: 'saved', saved: data };
      }
      // Signed out: the heart asks the session again.
      if (response.status === 403) {
        return { kind: 'signed-out' };
      }
      // Deleted, or made private, since the page showed it.
      if (response.status === 404) {
        return { kind: 'gone' };
      }
      throw new Error(`Saving a recipe failed with ${response.status}`);
    },
    onSuccess: async (result) => {
      if (result.kind === 'saved') {
        queryClient.setQueryData<SavedList>(FAVOURITES_KEY, placed(result.saved));
        await listsChanged(queryClient);
      }
    }
  });
};

export type Unsaving = { kind: 'unsaved'; undo: string } | { kind: 'signed-out' } | { kind: 'gone' };

// The card leaves at once, so a list's page never waits on it; a failure puts it back.
export const useUnsave = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: UNSAVE_KEY,
    mutationFn: async (saved: SavedRecipe): Promise<Unsaving> => {
      const { data, response } = await api.DELETE('/api/lists/favourites/saved/{saved_id}/', {
        params: { path: { saved_id: saved.id } }
      });
      if (data !== undefined) {
        return { kind: 'unsaved', undo: data.undo };
      }
      if (response.status === 403) {
        return { kind: 'signed-out' };
      }
      // Taken out already, on another page or device.
      if (response.status === 404) {
        return { kind: 'gone' };
      }
      throw new Error(`Unsaving a recipe failed with ${response.status}`);
    },
    onMutate: async (saved) => {
      await queryClient.cancelQueries({ queryKey: FAVOURITES_KEY });
      queryClient.setQueryData<SavedList>(FAVOURITES_KEY, without(saved.id));
    },
    onSettled: async (result, error, saved) => {
      if (error !== null || result?.kind === 'signed-out') {
        queryClient.setQueryData<SavedList>(FAVOURITES_KEY, placed(saved));
        return;
      }
      await listsChanged(queryClient);
    }
  });
};

// Which recipes are being saved (by slug) and unsaved (by id) right now, from any heart, so each heart knows its own.
export const usePendingSaves = () => {
  const saving = useMutationState({
    filters: { mutationKey: SAVE_KEY, status: 'pending' },
    select: ({ state }) => state.variables as string
  });
  const unsaving = useMutationState({
    filters: { mutationKey: UNSAVE_KEY, status: 'pending' },
    select: ({ state }) => (state.variables as SavedRecipe).recipe?.id
  });
  return { saving, unsaving };
};

export type Restoring = { kind: 'restored'; saved: SavedRecipe } | { kind: 'expired' } | { kind: 'signed-out' };

export const useUndoUnsave = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (undo: string): Promise<Restoring> => {
      const { data, response } = await api.POST('/api/lists/favourites/saved/restore/', { body: { undo } });
      if (data !== undefined) {
        return { kind: 'restored', saved: data };
      }
      // Over an hour later, or after signing in as someone else.
      if (response.status === 400) {
        return { kind: 'expired' };
      }
      if (response.status === 403) {
        return { kind: 'signed-out' };
      }
      throw new Error(`Putting a recipe back failed with ${response.status}`);
    },
    onSuccess: async (result) => {
      if (result.kind === 'restored') {
        queryClient.setQueryData<SavedList>(FAVOURITES_KEY, placed(result.saved));
        await listsChanged(queryClient);
      }
    }
  });
};
