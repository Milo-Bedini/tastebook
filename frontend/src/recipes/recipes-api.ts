import {
  keepPreviousData,
  type MutationKey,
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient
} from '@tanstack/react-query';

import { api } from '../api/client';
import type { components } from '../api/schema';
import type { RecipeFilters } from './recipe-filters';

type Recipe = components['schemas']['Recipe'];
type Visibility = components['schemas']['Visibility'];
type NewReport = components['schemas']['NewReport'];

export type RecipeQuery = { searchTerm: string; filters: RecipeFilters };

// Leaves out what filters nothing, so an unfiltered list asks for /api/recipes/ with no query string.
const toQuery = ({ searchTerm, filters }: RecipeQuery) => ({
  ...(searchTerm === '' ? {} : { q: searchTerm }),
  ...(filters.cuisines.length === 0 ? {} : { cuisine: filters.cuisines }),
  ...(filters.courses.length === 0 ? {} : { course: filters.courses }),
  ...(filters.difficulties.length === 0 ? {} : { difficulty: filters.difficulties }),
  ...(filters.times.total === null ? {} : { max_total: filters.times.total }),
  ...(filters.times.prep === null ? {} : { max_prep: filters.times.prep }),
  ...(filters.times.cook === null ? {} : { max_cook: filters.times.cook }),
  ...(filters.onePot ? { one_pot: true } : {}),
  ...(filters.diets.length === 0 ? {} : { diet: filters.diets }),
  ...(filters.includedIngredients.length === 0 ? {} : { include_ingredient: filters.includedIngredients }),
  ...(filters.includedIngredients.length < 2 || filters.includeMatch === 'any'
    ? {}
    : { include_match: filters.includeMatch }),
  ...(filters.excludedIngredients.length === 0 ? {} : { exclude_ingredient: filters.excludedIngredients })
});

export const useRecipes = (query: RecipeQuery) =>
  useQuery({
    queryKey: ['recipes', toQuery(query)],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/recipes/', { params: { query: toQuery(query) } });
      if (error || !data) {
        throw new Error('Recipes request failed');
      }
      // The query travels with its results, so previous results shown while loading keep their own empty message.
      return { query, recipes: data };
    },
    placeholderData: keepPreviousData
  });

export const useRecipe = (slug: string) =>
  useQuery({
    queryKey: ['recipes', slug],
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/recipes/{slug}/', { params: { path: { slug } } });
      // A missing recipe is an answer, not a failure, so it's cached and never retried.
      if (response.status === 404) {
        return null;
      }
      if (error || !data) {
        throw new Error('Recipe request failed');
      }
      return data;
    }
  });

export type RecipeDeletion = { kind: 'deleted' } | { kind: 'signed-out' } | { kind: 'gone' };

export const useDeleteRecipe = (slug: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<RecipeDeletion> => {
      const { response } = await api.DELETE('/api/recipes/{slug}/', { params: { path: { slug } } });
      if (response.status === 204) {
        return { kind: 'deleted' };
      }
      // Signed out, or no household any more: the page asks the session again.
      if (response.status === 403) {
        return { kind: 'signed-out' };
      }
      // Deleted already, or the account may not delete it any more (its author came back, or it moved household).
      if (response.status === 404) {
        return { kind: 'gone' };
      }
      throw new Error(`Deleting a recipe failed with ${response.status}`);
    },
    onSuccess: async (result) => {
      if (result.kind === 'signed-out') {
        return;
      }
      // Removed rather than set to null, so the page still on screen doesn't say "Recipe not found" before it
      // navigates away; the next visit asks again.
      queryClient.removeQueries({ queryKey: ['recipes', slug], exact: true });
      await queryClient.invalidateQueries({ queryKey: ['recipes'], predicate: ({ queryKey }) => queryKey[1] !== slug });
    }
  });
};

export type VisibilityChange =
  | { kind: 'changed'; recipe: Recipe }
  // The API's own words: the recipe lacks something a public recipe needs.
  | { kind: 'refused'; message: string }
  | { kind: 'signed-out' }
  | { kind: 'gone' };

// DRF refuses a visibility as {"visibility": ["…"]}.
const visibilityMessage = (body: unknown): string | undefined => {
  if (typeof body !== 'object' || body === null || !('visibility' in body) || !Array.isArray(body.visibility)) {
    return undefined;
  }
  const [message] = body.visibility;
  return typeof message === 'string' ? message : undefined;
};

const visibilityKey = (slug: string) => ['recipes', slug, 'visibility'];

export const useSetVisibility = (slug: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: visibilityKey(slug),
    mutationFn: async (visibility: Visibility): Promise<VisibilityChange> => {
      const { data, error, response } = await api.PUT('/api/recipes/{slug}/visibility/', {
        params: { path: { slug } },
        body: { visibility }
      });
      if (data !== undefined) {
        return { kind: 'changed', recipe: data };
      }
      const message = response.status === 400 ? visibilityMessage(error) : undefined;
      if (message !== undefined) {
        return { kind: 'refused', message };
      }
      // Signed out, or no household any more: the page asks the session again.
      if (response.status === 403) {
        return { kind: 'signed-out' };
      }
      // Deleted, or the account may not change it any more (it moved household, or someone else wrote it).
      if (response.status === 404) {
        return { kind: 'gone' };
      }
      throw new Error(`Changing a recipe's visibility failed with ${response.status}`);
    },
    onSuccess: async (result) => {
      if (result.kind === 'signed-out') {
        return;
      }
      if (result.kind === 'changed') {
        queryClient.setQueryData<Recipe>(['recipes', slug], result.recipe);
        // Only the lists: the recipe just set is already current.
        await queryClient.invalidateQueries({
          queryKey: ['recipes'],
          predicate: ({ queryKey }) => queryKey[1] !== slug
        });
        return;
      }
      // Refused or gone, the page shows what's true now.
      await queryClient.invalidateQueries({ queryKey: ['recipes'] });
    }
  });
};

// What the latest of the mutations under the key answered, for the page a control it held focus on has gone from.
const useLatestAnswer = (mutationKey: MutationKey): string | undefined =>
  useMutationState({
    filters: { mutationKey },
    select: ({ state }) => (state.data as { kind: string } | undefined)?.kind
  }).at(-1);

// Whether the latest change to the recipe's visibility found it gone, which can take the switch off the page with focus.
export const useVisibilityGone = (slug: string) => useLatestAnswer(visibilityKey(slug)) === 'gone';

export type RecipeCopying = { kind: 'copied'; recipe: Recipe } | { kind: 'signed-out' } | { kind: 'gone' };

const copyKey = (slug: string) => ['recipes', slug, 'copy'];

export const useCopyRecipe = (slug: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: copyKey(slug),
    mutationFn: async (): Promise<RecipeCopying> => {
      const { data, response } = await api.POST('/api/recipes/{slug}/copy/', { params: { path: { slug } } });
      if (data !== undefined) {
        return { kind: 'copied', recipe: data };
      }
      // Signed out, or no household any more: the page asks the session again.
      if (response.status === 403) {
        return { kind: 'signed-out' };
      }
      // Deleted, or made private by another household, since the page opened.
      if (response.status === 404) {
        return { kind: 'gone' };
      }
      throw new Error(`Copying a recipe failed with ${response.status}`);
    },
    onSuccess: async (result) => {
      if (result.kind === 'signed-out') {
        return;
      }
      if (result.kind === 'copied') {
        queryClient.setQueryData<Recipe>(['recipes', result.recipe.slug], result.recipe);
        // Only the lists: the copy just set is already current.
        await queryClient.invalidateQueries({
          queryKey: ['recipes'],
          predicate: ({ queryKey }) => queryKey[1] !== result.recipe.slug
        });
        return;
      }
      // Gone, the page shows what's true now.
      await queryClient.invalidateQueries({ queryKey: ['recipes'] });
    }
  });
};

// Whether the latest copy of the recipe found it gone, which takes the page, and the focused button, away.
export const useCopyGone = (slug: string) => useLatestAnswer(copyKey(slug)) === 'gone';

export type ShareLinkChange =
  | { kind: 'changed'; recipe: Recipe }
  // The API's own words: the recipe is public, so it has no link to turn on.
  | { kind: 'refused'; message: string }
  | { kind: 'signed-out' }
  | { kind: 'gone' };

// DRF refuses a share link as {"share_link": ["…"]}.
const shareLinkMessage = (body: unknown): string | undefined => {
  if (typeof body !== 'object' || body === null || !('share_link' in body) || !Array.isArray(body.share_link)) {
    return undefined;
  }
  const [message] = body.share_link;
  return typeof message === 'string' ? message : undefined;
};

const shareLinkKey = (slug: string) => ['recipes', slug, 'share-link'];

const sendShareLink = (slug: string, on: boolean) => {
  const params = { params: { path: { slug } } };
  return on
    ? api.PUT('/api/recipes/{slug}/share-link/', params)
    : api.DELETE('/api/recipes/{slug}/share-link/', params);
};

export const useSetShareLink = (slug: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: shareLinkKey(slug),
    mutationFn: async (on: boolean): Promise<ShareLinkChange> => {
      const { data, error, response } = await sendShareLink(slug, on);
      if (data !== undefined) {
        return { kind: 'changed', recipe: data };
      }
      const message = response.status === 400 ? shareLinkMessage(error) : undefined;
      if (message !== undefined) {
        return { kind: 'refused', message };
      }
      // Signed out, or no household any more: the page asks the session again.
      if (response.status === 403) {
        return { kind: 'signed-out' };
      }
      // Deleted, or the account may not share it any more (it moved household).
      if (response.status === 404) {
        return { kind: 'gone' };
      }
      throw new Error(`Turning a share link ${on ? 'on' : 'off'} failed with ${response.status}`);
    },
    onSuccess: async (result) => {
      if (result.kind === 'signed-out') {
        return;
      }
      if (result.kind === 'changed') {
        queryClient.setQueryData<Recipe>(['recipes', slug], result.recipe);
        return;
      }
      // Refused or gone, the page shows what's true now.
      await queryClient.invalidateQueries({ queryKey: ['recipes'] });
    }
  });
};

// Whether the latest change to the recipe's share link found it gone or public, which can take the switch off the page
// with focus.
export const useShareLinkGone = (slug: string) => {
  const kind = useLatestAnswer(shareLinkKey(slug));
  return kind === 'gone' || kind === 'refused';
};

export type RecipeReporting =
  // Hidden: the first report hid the recipe; otherwise staff restored it before, and it stays up.
  | { kind: 'reported'; hidden: boolean }
  // The API's own words: reported already, or a reason or note it won't take.
  | { kind: 'refused'; message: string }
  | { kind: 'signed-out' }
  | { kind: 'gone' };

// DRF refuses a report as {"non_field_errors": ["…"]}, or under the field it refuses.
const reportMessage = (body: unknown): string | undefined => {
  if (typeof body !== 'object' || body === null) {
    return undefined;
  }
  const [message] = Object.values(body).flatMap((messages: unknown) => (Array.isArray(messages) ? messages : []));
  return typeof message === 'string' ? message : undefined;
};

const reportKey = (slug: string) => ['recipes', slug, 'report'];

export const useReportRecipe = (slug: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: reportKey(slug),
    mutationFn: async (report: NewReport): Promise<RecipeReporting> => {
      const { data, error, response } = await api.POST('/api/recipes/{slug}/report/', {
        params: { path: { slug } },
        body: report
      });
      if (data !== undefined) {
        return { kind: 'reported', hidden: data.hidden };
      }
      const message = response.status === 400 ? reportMessage(error) : undefined;
      if (message !== undefined) {
        return { kind: 'refused', message };
      }
      // Signed out: the page asks the session again.
      if (response.status === 403) {
        return { kind: 'signed-out' };
      }
      // Deleted, made private or hidden by another report since the page opened.
      if (response.status === 404) {
        return { kind: 'gone' };
      }
      throw new Error(`Reporting a recipe failed with ${response.status}`);
    },
    onSuccess: async (result) => {
      if (result.kind === 'signed-out') {
        return;
      }
      if (result.kind === 'reported' && result.hidden) {
        // Removed rather than set to null, so the page still on screen doesn't say "Recipe not found" before it
        // navigates away; the lists it's gone from ask again.
        queryClient.removeQueries({ queryKey: ['recipes', slug], exact: true });
        await queryClient.invalidateQueries({
          queryKey: ['recipes'],
          predicate: ({ queryKey }) => queryKey[1] !== slug
        });
        return;
      }
      if (result.kind === 'reported') {
        queryClient.setQueryData<Recipe>(['recipes', slug], (recipe) => recipe && { ...recipe, reported: true });
        return;
      }
      // Refused, the page shows whether it's reported; gone, the page and the lists show it's gone.
      await queryClient.invalidateQueries({ queryKey: result.kind === 'gone' ? ['recipes'] : ['recipes', slug] });
    }
  });
};

// Whether the latest report of the recipe found it gone, which takes the page, and the focused button, away.
export const useReportGone = (slug: string) => useLatestAnswer(reportKey(slug)) === 'gone';

// A share link's recipe, or null for a link that's off or never was.
export const useSharedRecipe = (token: string) =>
  useQuery({
    queryKey: ['shared', token],
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/shared/{token}/', { params: { path: { token } } });
      // A link that's off is an answer, not a failure, so it's cached and never retried.
      if (response.status === 404) {
        return null;
      }
      if (error || !data) {
        throw new Error('Shared recipe request failed');
      }
      return data;
    }
  });
