import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '../api/client';
import type { RecipeFilters } from './recipe-filters';

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
