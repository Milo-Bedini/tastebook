import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '../api/client';
import type { components } from '../api/schema';

type Recipe = components['schemas']['Recipe'];

export type NewRecipe = components['schemas']['NewRecipe'];

export type RecipeErrors = Partial<Record<keyof NewRecipe | 'non_field_errors', string>>;

export type RecipeSaving =
  | { kind: 'saved'; recipe: Recipe }
  | { kind: 'refused'; errors: RecipeErrors }
  | { kind: 'signed-out' };

// DRF answers a refusal as {"<field>": ["…"], "non_field_errors": ["…"]}; the page shows each key's first message.
const firstMessages = (body: unknown): RecipeErrors =>
  typeof body === 'object' && body !== null
    ? Object.fromEntries(
        Object.entries(body).flatMap(([key, messages]) =>
          Array.isArray(messages) && typeof messages[0] === 'string' ? [[key, messages[0]]] : []
        )
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
