import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '../api/client';
import type { components } from '../api/schema';

type Recipe = components['schemas']['Recipe'];

export type NewRecipe = components['schemas']['NewRecipe'];

export type RecipeChanges = components['schemas']['PatchedRecipeChanges'];

export type RecipeErrors = Partial<Record<keyof NewRecipe | 'non_field_errors', string>>;

export type RecipeSaving =
  | { kind: 'saved'; recipe: Recipe }
  | { kind: 'refused'; errors: RecipeErrors }
  | { kind: 'signed-out' }
  | { kind: 'gone' };

const SOME_INGREDIENTS = "Some ingredients couldn't be saved. Check them and try again.";

// DRF answers a refusal as {"<field>": ["…"], "non_field_errors": ["…"]}; the page shows each key's first message.
// A list of lines or groups answers an object keyed by the index of each one refused, which the page sums up.
const firstMessages = (body: unknown): RecipeErrors =>
  typeof body === 'object' && body !== null
    ? Object.fromEntries(
        Object.entries(body).flatMap(([key, messages]) => {
          if (Array.isArray(messages)) {
            return typeof messages[0] === 'string' ? [[key, messages[0]]] : [];
          }
          return typeof messages === 'object' && messages !== null ? [[key, SOME_INGREDIENTS]] : [];
        })
      )
    : {};

export const useAddRecipe = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (recipe: NewRecipe): Promise<RecipeSaving> => {
      const { data, error, response } = await api.POST('/api/recipes/', { body: recipe });
      if (data !== undefined) {
        return { kind: 'saved', recipe: data };
      }
      if (response.status === 400) {
        return { kind: 'refused', errors: firstMessages(error) };
      }
      // Signed out, or no household yet: the page asks the session again, which sends a visitor to sign-in.
      if (response.status === 403) {
        return { kind: 'signed-out' };
      }
      throw new Error(`Adding a recipe failed with ${response.status}`);
    },
    onSuccess: async (result) => {
      if (result.kind !== 'saved') {
        return;
      }
      queryClient.setQueryData<Recipe>(['recipes', result.recipe.slug], result.recipe);
      // Only the lists: the recipe just set is already current.
      await queryClient.invalidateQueries({
        queryKey: ['recipes'],
        predicate: ({ queryKey }) => queryKey[1] !== result.recipe.slug
      });
    }
  });
};

export const useEditRecipe = (slug: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (changes: RecipeChanges): Promise<RecipeSaving> => {
      const { data, error, response } = await api.PATCH('/api/recipes/{slug}/', {
        params: { path: { slug } },
        body: changes
      });
      if (data !== undefined) {
        return { kind: 'saved', recipe: data };
      }
      if (response.status === 400) {
        return { kind: 'refused', errors: firstMessages(error) };
      }
      if (response.status === 403) {
        return { kind: 'signed-out' };
      }
      // Deleted, or the member has left its household meanwhile, so no retry can save it.
      if (response.status === 404) {
        return { kind: 'gone' };
      }
      throw new Error(`Editing a recipe failed with ${response.status}`);
    },
    onSuccess: async (result) => {
      if (result.kind !== 'saved' && result.kind !== 'gone') {
        return;
      }
      // A recipe that's gone is cached as useRecipe caches a 404, so the page says it isn't found.
      queryClient.setQueryData<Recipe | null>(['recipes', slug], result.kind === 'saved' ? result.recipe : null);
      // Only the lists: the recipe just set is already current.
      await queryClient.invalidateQueries({
        queryKey: ['recipes'],
        predicate: ({ queryKey }) => queryKey[1] !== slug
      });
    }
  });
};
