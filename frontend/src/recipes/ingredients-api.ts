import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '../api/client';
import type { components } from '../api/schema';

type IngredientOption = components['schemas']['IngredientOption'];

export type IngredientAdding =
  | { kind: 'added'; ingredient: IngredientOption }
  | { kind: 'refused'; message: string }
  | { kind: 'signed-out' };

export const useIngredients = () =>
  useQuery({
    queryKey: ['ingredients'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/ingredients/');
      if (error || !data) {
        throw new Error('Ingredients request failed');
      }
      return data;
    }
  });

// DRF refuses a name as {"name": ["…"]}.
const nameMessage = (body: unknown): string | undefined => {
  if (typeof body !== 'object' || body === null || !('name' in body) || !Array.isArray(body.name)) {
    return undefined;
  }
  const [message] = body.name;
  return typeof message === 'string' ? message : undefined;
};

export const useAddIngredient = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (name: string): Promise<IngredientAdding> => {
      const { data, error, response } = await api.POST('/api/ingredients/', { body: { name } });
      // 200 when the list already had it by that name or a synonym, 201 when it's new: the same to the form.
      if (data !== undefined) {
        return { kind: 'added', ingredient: data };
      }
      const message = response.status === 400 ? nameMessage(error) : undefined;
      if (message !== undefined) {
        return { kind: 'refused', message };
      }
      // Signed out, or no household yet: the form asks the session again, which sends a visitor to sign-in.
      if (response.status === 403) {
        return { kind: 'signed-out' };
      }
      throw new Error(`Adding an ingredient failed with ${response.status}`);
    },
    onSuccess: (result) => {
      if (result.kind !== 'added') {
        return;
      }
      queryClient.setQueryData<IngredientOption[]>(['ingredients'], (ingredients) =>
        ingredients === undefined || ingredients.some(({ slug }) => slug === result.ingredient.slug)
          ? ingredients
          : [...ingredients, result.ingredient]
      );
    }
  });
};
