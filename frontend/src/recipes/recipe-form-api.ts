import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api, apiBaseUrl, csrfToken } from '../api/client';
import type { components } from '../api/schema';

type Recipe = components['schemas']['Recipe'];

export type NewRecipe = components['schemas']['NewRecipe'];

export type RecipeChanges = components['schemas']['PatchedRecipeChanges'];

export type StoredPhoto = components['schemas']['RecipePhoto'];

export type RecipeErrors = Partial<Record<keyof NewRecipe | 'non_field_errors', string>>;

export type RecipeSaving =
  | { kind: 'saved'; recipe: Recipe }
  // A refused step is keyed by its place among the steps sent.
  | { kind: 'refused'; errors: RecipeErrors; stepErrors: Record<string, string> }
  | { kind: 'signed-out' }
  | { kind: 'gone' };

const SOME_INGREDIENTS = "Some ingredients couldn't be saved. Check them and try again.";

const firstOf = (messages: unknown): string[] =>
  Array.isArray(messages) && typeof messages[0] === 'string' ? [messages[0]] : [];

// DRF answers a refusal as {"<field>": ["…"], "non_field_errors": ["…"]}; the page shows each key's first message.
// A list of lines or groups answers an object keyed by the index of each one refused, which the page sums up; the
// steps' object is kept apart, so each refused step shows its own message.
const firstMessages = (body: unknown): RecipeErrors =>
  typeof body === 'object' && body !== null
    ? Object.fromEntries(
        Object.entries(body).flatMap(([key, messages]) => {
          if (Array.isArray(messages)) {
            return firstOf(messages).map((message) => [key, message]);
          }
          return typeof messages === 'object' && messages !== null && key !== 'steps' ? [[key, SOME_INGREDIENTS]] : [];
        })
      )
    : {};

const stepMessages = (body: unknown): Record<string, string> => {
  const steps = typeof body === 'object' && body !== null && 'steps' in body ? body.steps : undefined;
  return typeof steps === 'object' && steps !== null && !Array.isArray(steps)
    ? Object.fromEntries(
        Object.entries(steps).flatMap(([index, messages]) => firstOf(messages).map((message) => [index, message]))
      )
    : {};
};

const refused = (body: unknown): RecipeSaving => ({
  kind: 'refused',
  errors: firstMessages(body),
  stepErrors: stepMessages(body)
});

export const useAddRecipe = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (recipe: NewRecipe): Promise<RecipeSaving> => {
      const { data, error, response } = await api.POST('/api/recipes/', { body: recipe });
      if (data !== undefined) {
        return { kind: 'saved', recipe: data };
      }
      if (response.status === 400) {
        return refused(error);
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
        return refused(error);
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

export type PhotoUploading =
  | { kind: 'stored'; photo: StoredPhoto }
  // Tastebook refused the file, saying why.
  | { kind: 'refused'; message: string }
  | { kind: 'signed-out' };

type PhotoToUpload = {
  photo: Blob;
  name: string;
  // How far the upload has got, from 0 to 100.
  onProgress: (progress: number) => void;
  signal: AbortSignal;
};

const refusalOf = (body: unknown): string | undefined => {
  const messages = typeof body === 'object' && body !== null && 'photo' in body ? body.photo : undefined;
  return Array.isArray(messages) && typeof messages[0] === 'string' ? messages[0] : undefined;
};

// XMLHttpRequest rather than the API client, as only it reports how much of an upload has been sent.
const sendPhoto = ({ photo, name, onProgress, signal }: PhotoToUpload) =>
  new Promise<PhotoUploading>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', `${apiBaseUrl}/api/photos/`);
    request.responseType = 'json';
    const token = csrfToken();
    if (token !== undefined) {
      request.setRequestHeader('X-CSRFToken', token);
    }
    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        onProgress((event.loaded / event.total) * 100);
      }
    });
    request.addEventListener('load', () => {
      const refusal = refusalOf(request.response);
      if (request.status === 201) {
        resolve({ kind: 'stored', photo: request.response as StoredPhoto });
      } else if (request.status === 400 && refusal !== undefined) {
        resolve({ kind: 'refused', message: refusal });
      } else if (request.status === 403) {
        resolve({ kind: 'signed-out' });
      } else {
        reject(new Error(`Uploading a photo failed with ${request.status}`));
      }
    });
    request.addEventListener('error', () => reject(new Error('Uploading a photo failed')));
    request.addEventListener('abort', () => reject(new DOMException('The upload was cancelled', 'AbortError')));
    signal.addEventListener('abort', () => request.abort());
    const body = new FormData();
    body.append('photo', photo, name);
    request.send(body);
  });

export const useUploadPhoto = () => useMutation({ mutationFn: sendPhoto });
