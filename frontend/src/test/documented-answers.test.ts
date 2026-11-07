import { describe, expect, it } from 'vitest';

import { describeMissing, missingAnswers, type Paths } from './documented-answers';

const PATHS: Paths = {
  '/api/recipes/': {
    get: { responses: { '200': {}, '403': {} } },
    post: { responses: { '201': {}, '400': {}, '403': {} } }
  },
  '/api/recipes/{slug}/': {
    patch: { responses: { '200': {}, '404': {} } },
    delete: { responses: { '204': {}, '404': {} } }
  }
};

const ADD = `export const useAddRecipe = () => useMutation({ mutationFn: () => api.POST('/api/recipes/', { body }) });`;
const EDIT = `export const useEditRecipe = (slug: string) => {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: () => api.PATCH(
    '/api/recipes/{slug}/', { params: { path: { slug } } }) });
};
export const useRetitleRecipe = () => useMutation({ mutationFn: () => api.PATCH('/api/recipes/{slug}/', {}) });`;
const LIST = `export const useRecipes = () => useQuery({ queryFn: () => api.GET('/api/recipes/') });`;

describe('missingAnswers', () => {
  it.each([
    [
      'nothing was answered',
      [ADD],
      [],
      ['POST /api/recipes/ 400 (useAddRecipe)', 'POST /api/recipes/ 403 (useAddRecipe)']
    ],
    ['one status was answered', [ADD], ['POST /api/recipes/ 403'], ['POST /api/recipes/ 400 (useAddRecipe)']],
    ['every status was answered', [ADD], ['POST /api/recipes/ 400', 'POST /api/recipes/ 403'], []],
    [
      'the answer was to another method',
      [ADD],
      ['GET /api/recipes/ 400', 'GET /api/recipes/ 403'],
      ['POST /api/recipes/ 400 (useAddRecipe)', 'POST /api/recipes/ 403 (useAddRecipe)']
    ],
    ['a path parameter was answered', [EDIT], ['PATCH /api/recipes/apple-tart/ 404'], []],
    [
      'a deeper path was answered',
      [EDIT],
      ['PATCH /api/recipes/apple-tart/steps/ 404'],
      ['PATCH /api/recipes/{slug}/ 404 (useEditRecipe, useRetitleRecipe)']
    ],
    ['only a query calls the endpoint', [LIST], [], []],
    ['no source calls the endpoint', [], [], []]
  ])('lists what is missing when %s', (_, sources, answered, missing) => {
    expect(
      missingAnswers(PATHS, sources, answered).map(
        ({ method, path, status, hooks }) => `${method} ${path} ${status} (${hooks.join(', ')})`
      )
    ).toEqual(missing);
  });

  it('names the method, path, status and hook of what is missing', () => {
    const [missing] = missingAnswers(PATHS, [EDIT], []);

    expect(missing && describeMissing(missing)).toBe(
      'PATCH /api/recipes/{slug}/ 404 (useEditRecipe, useRetitleRecipe): no page test answers it through MSW'
    );
  });
});
