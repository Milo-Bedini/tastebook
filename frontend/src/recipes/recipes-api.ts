import { keepPreviousData, useMutation, useMutationState, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '../api/client';
import type { components } from '../api/schema';
import type { RecipeFilters } from './recipe-filters';

type Recipe = components['schemas']['Recipe'];
type Visibility = components['schemas']['Visibility'];

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

// Whether the latest change to the recipe's visibility found it gone, which can take the switch off the page with focus.
export const useVisibilityGone = (slug: string) =>
  useMutationState({
    filters: { mutationKey: visibilityKey(slug) },
    select: ({ state }) => (state.data as VisibilityChange | undefined)?.kind === 'gone'
  }).at(-1) === true;
