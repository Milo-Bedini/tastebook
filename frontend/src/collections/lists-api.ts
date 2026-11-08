import {
  type QueryClient,
  type QueryKey,
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient
} from '@tanstack/react-query';

import { api } from '../api/client';
import type { components } from '../api/schema';

export type SavedRecipe = components['schemas']['SavedRecipe'];
export type SavedList = components['schemas']['SavedList'];
export type ListSummary = components['schemas']['ListSummary'];
export type Scope = components['schemas']['ScopeEnum'];

// Where a list is, and the address its page has: a household list's never clashes with one of your own.
export type ListAddress = { scope: Scope; slug: string };

export const FAVOURITES: ListAddress = { scope: 'personal', slug: 'favourites' };

export const LIST_NAME_MAX_LENGTH = 60;

export const NO_LIST_NAME = 'Give the list a name, like Weeknight dinners.';

export const listPath = ({ scope, slug }: ListAddress) =>
  scope === 'household' ? `/lists/household/${slug}` : `/lists/${slug}`;

const LISTS_KEY = ['collections', 'lists'];
const SAVE_KEY = ['collections', 'save'];

export const listKey = ({ scope, slug }: ListAddress): QueryKey => ['collections', 'list', scope, slug];

const FAVOURITES_KEY = listKey(FAVOURITES);

// Each list's removals are told apart, so a heart is busy only while Favourites is losing its recipe.
const unsaveKey = (key: QueryKey): QueryKey => ['collections', 'unsave', ...key];

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

const getList = async ({ scope, slug }: ListAddress) => {
  const params = { params: { path: { slug } } };
  return scope === 'household'
    ? api.GET('/api/lists/household/{slug}/', params)
    : api.GET('/api/lists/{slug}/', params);
};

// Null once the list has gone: deleted, renamed or never there.
export const useList = (address: ListAddress, { enabled = true }: { enabled?: boolean } = {}) =>
  useQuery({
    queryKey: listKey(address),
    queryFn: async (): Promise<SavedList | null> => {
      const { data, response } = await getList(address);
      if (data !== undefined) {
        return data;
      }
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Getting a list failed with ${response.status}`);
    },
    enabled
  });

// Only signed in: signed out there are no lists, and every heart shows unsaved.
export const useFavourites = ({ enabled = true }: { enabled?: boolean } = {}) => useList(FAVOURITES, { enabled });

const newestFirst = (a: SavedRecipe, b: SavedRecipe) =>
  b.saved_at === a.saved_at ? b.id - a.id : b.saved_at.localeCompare(a.saved_at);

// Puts a saved recipe in its place: newest saved first, as the API lists them.
const placed = (saved: SavedRecipe) => (list: SavedList | null | undefined) =>
  list === undefined || list === null
    ? list
    : { ...list, saved_recipes: [...list.saved_recipes.filter(({ id }) => id !== saved.id), saved].sort(newestFirst) };

const without = (savedId: number) => (list: SavedList | null | undefined) =>
  list === undefined || list === null
    ? list
    : { ...list, saved_recipes: list.saved_recipes.filter(({ id }) => id !== savedId) };

// The Lists page's counts and fans follow every list, so it's asked again after every change.
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
        queryClient.setQueryData<SavedList | null>(FAVOURITES_KEY, placed(result.saved));
        await listsChanged(queryClient);
      }
    }
  });
};

export type Unsaving = { kind: 'unsaved'; undo: string } | { kind: 'signed-out' } | { kind: 'gone' };

// The card leaves its list at once, so the list's page never waits on it; a failure puts it back.
export const useUnsave = (address: ListAddress = FAVOURITES) => {
  const queryClient = useQueryClient();
  const key = listKey(address);
  return useMutation({
    mutationKey: unsaveKey(key),
    mutationFn: async (saved: SavedRecipe): Promise<Unsaving> => {
      const { data, response } = await api.DELETE('/api/lists/saved/{saved_id}/', {
        params: { path: { saved_id: saved.id } }
      });
      if (data !== undefined) {
        return { kind: 'unsaved', undo: data.undo };
      }
      if (response.status === 403) {
        return { kind: 'signed-out' };
      }
      // Taken out already, on another page or device, or by someone else in the household.
      if (response.status === 404) {
        return { kind: 'gone' };
      }
      throw new Error(`Unsaving a recipe failed with ${response.status}`);
    },
    onMutate: async (saved) => {
      await queryClient.cancelQueries({ queryKey: key });
      queryClient.setQueryData<SavedList | null>(key, without(saved.id));
    },
    onSettled: async (result, error, saved) => {
      if (error !== null || result?.kind === 'signed-out') {
        queryClient.setQueryData<SavedList | null>(key, placed(saved));
        return;
      }
      await listsChanged(queryClient);
    }
  });
};

// Which recipes are being saved (by slug) and unsaved from Favourites (by id) right now, from any heart, so each heart
// knows its own.
export const usePendingSaves = () => {
  const saving = useMutationState({
    filters: { mutationKey: SAVE_KEY, status: 'pending' },
    select: ({ state }) => state.variables as string
  });
  const unsaving = useMutationState({
    filters: { mutationKey: unsaveKey(FAVOURITES_KEY), exact: true, status: 'pending' },
    select: ({ state }) => (state.variables as SavedRecipe).recipe?.id
  });
  return { saving, unsaving };
};

export type Restoring = { kind: 'restored'; saved: SavedRecipe } | { kind: 'expired' } | { kind: 'signed-out' };

export const useUndoUnsave = (address: ListAddress = FAVOURITES) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (undo: string): Promise<Restoring> => {
      const { data, response } = await api.POST('/api/lists/saved/restore/', { body: { undo } });
      if (data !== undefined) {
        return { kind: 'restored', saved: data };
      }
      // Over an hour later, after signing in as someone else, or once the list has gone.
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
        queryClient.setQueryData<SavedList | null>(listKey(address), placed(result.saved));
        await listsChanged(queryClient);
      }
    }
  });
};

// DRF answers a refused field as {"name": ["…"]}, or {"scope": ["…"]} for a household list without a household.
const refusal = (body: unknown): string => {
  const fields = typeof body === 'object' && body !== null ? Object.values(body) : [];
  const messages = fields.find((messages) => Array.isArray(messages));
  return Array.isArray(messages) && typeof messages[0] === 'string' ? messages[0] : NO_LIST_NAME;
};

export type ListChange =
  | { kind: 'saved'; list: SavedList }
  | { kind: 'refused'; message: string }
  | { kind: 'signed-out' }
  | { kind: 'gone' };

// The list's page opens on the answer, so it shows without asking again.
const keep = (queryClient: QueryClient, list: SavedList) => {
  queryClient.setQueryData<SavedList | null>(listKey(list), list);
  return listsChanged(queryClient);
};

export const useMakeList = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, scope }: { name: string; scope: Scope }): Promise<ListChange> => {
      const { data, error, response } = await api.POST('/api/lists/', { body: { name, scope } });
      if (data !== undefined) {
        return { kind: 'saved', list: data };
      }
      if (response.status === 400) {
        return { kind: 'refused', message: refusal(error) };
      }
      if (response.status === 403) {
        return { kind: 'signed-out' };
      }
      throw new Error(`Making a list failed with ${response.status}`);
    },
    onSuccess: (result) => (result.kind === 'saved' ? keep(queryClient, result.list) : undefined)
  });
};

const patchList = ({ scope, slug }: ListAddress, name: string) => {
  const request = { params: { path: { slug } }, body: { name } };
  return scope === 'household'
    ? api.PATCH('/api/lists/household/{slug}/', request)
    : api.PATCH('/api/lists/{slug}/', request);
};

export const useRenameList = (address: ListAddress) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (name: string): Promise<ListChange> => {
      const { data, error, response } = await patchList(address, name);
      if (data !== undefined) {
        return { kind: 'saved', list: data };
      }
      if (response.status === 400) {
        return { kind: 'refused', message: refusal(error) };
      }
      if (response.status === 403) {
        return { kind: 'signed-out' };
      }
      // Deleted by someone in the household meanwhile, or renamed in another tab.
      if (response.status === 404) {
        return { kind: 'gone' };
      }
      throw new Error(`Renaming a list failed with ${response.status}`);
    },
    onSuccess: (result) => {
      if (result.kind === 'gone') {
        queryClient.setQueryData<SavedList | null>(listKey(address), null);
        return listsChanged(queryClient);
      }
      return result.kind === 'saved' ? keep(queryClient, result.list) : undefined;
    }
  });
};

const deleteList = ({ scope, slug }: ListAddress) => {
  const params = { params: { path: { slug } } };
  return scope === 'household'
    ? api.DELETE('/api/lists/household/{slug}/', params)
    : api.DELETE('/api/lists/{slug}/', params);
};

// Gone is deleted too: someone in the household got there first.
export type ListDeletion = { kind: 'deleted' } | { kind: 'gone' } | { kind: 'signed-out' };

export const useDeleteList = (address: ListAddress) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<ListDeletion> => {
      const { response } = await deleteList(address);
      if (response.ok) {
        return { kind: 'deleted' };
      }
      if (response.status === 404) {
        return { kind: 'gone' };
      }
      if (response.status === 403) {
        return { kind: 'signed-out' };
      }
      throw new Error(`Deleting a list failed with ${response.status}`);
    },
    onSuccess: async (result) => {
      if (result.kind !== 'signed-out') {
        // Not refetched while its page is still open; asked again if the address is opened later.
        await queryClient.invalidateQueries({ queryKey: listKey(address), exact: true, refetchType: 'none' });
        await listsChanged(queryClient);
      }
    }
  });
};
