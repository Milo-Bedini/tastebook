import { describe, expect, it } from 'vitest';

import {
  describeMissing,
  describeStale,
  describeUnhandled,
  missingAnswers,
  type Paths,
  staleUnbranched,
  type Unbranched,
  unhandledAnswers
} from './documented-answers';

const PATHS: Paths = {
  '/api/recipes/': {
    get: { responses: { '200': {}, '403': {} } },
    post: { responses: { '201': {}, '400': {}, '403': {} } }
  },
  '/api/recipes/{slug}/': {
    patch: { responses: { '200': {}, '404': {} } },
    delete: { responses: { '204': {}, '404': {} } }
  },
  '/api/photos/': {
    post: { responses: { '201': {}, '400': {}, '403': {}, '503': {} } }
  }
};

const ADD = `export const useAddRecipe = () => useMutation({ mutationFn: () => api.POST('/api/recipes/', { body }) });`;
const EDIT = `export const useEditRecipe = (slug: string) => {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: () => api.PATCH(
    '/api/recipes/{slug}/', { params: { path: { slug } } }) });
};
export const useRetitleRecipe = () => useMutation({ mutationFn: () => api.PATCH('/api/recipes/{slug}/', {}) });`;
const SAVE = `export const useSaveRecipe = () => useMutation({ mutationFn: async () => {
  const { data, response } = await api.POST('/api/recipes/', { body });
  if (response.status === 400) {
    return { kind: 'refused' };
  }
  if (response.status === 403) {
    return { kind: 'signed-out' };
  }
  throw new Error(\`Saving failed with \${response.status}\`);
} });`;
// The 403 is answered by a page test, but only the final throw meets it.
const SAVE_403_THROWS = SAVE.replace('response.status === 403', 'response.status === 409');
const REMOVE = `const removeRecipe = (slug: string) => api.DELETE('/api/recipes/{slug}/', { params: { path: { slug } } });

export const useRemoveRecipe = (slug: string) => useMutation({ mutationFn: async () => {
  const { response } = await removeRecipe(slug);
  if (response.status === 404) {
    return { kind: 'gone' };
  }
} });`;
// Sent with XMLHttpRequest for its progress, by a helper the hook hands to useMutation without calling it.
const UPLOAD = `const sendPhoto = () => new Promise((resolve, reject) => {
  const request = new XMLHttpRequest();
  request.open('POST', \`\${apiBaseUrl}/api/photos/\`);
  request.addEventListener('load', () => {
    if (request.status === 400) {
      resolve({ kind: 'refused' });
    } else {
      reject(new Error(\`Uploading a photo failed with \${request.status}\`));
    }
  });
});

export const useUploadPhoto = () => useMutation({ mutationFn: sendPhoto });`;
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
    [
      'a helper the hook calls makes the request',
      [`${ADD}\n${REMOVE}`],
      ['POST /api/recipes/ 400', 'POST /api/recipes/ 403'],
      ['DELETE /api/recipes/{slug}/ 404 (useRemoveRecipe)']
    ],
    [
      'an XMLHttpRequest makes the request',
      [UPLOAD],
      ['POST /api/photos/ 403'],
      ['POST /api/photos/ 400 (useUploadPhoto)', 'POST /api/photos/ 503 (useUploadPhoto)']
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

const REASON = { reason: 'the failure message is right' };

describe('unhandledAnswers', () => {
  it.each<[string, string[], Unbranched[], string[]]>([
    [
      'the hook never branches on a status',
      [ADD],
      [],
      ['POST /api/recipes/ 400 (useAddRecipe)', 'POST /api/recipes/ 403 (useAddRecipe)']
    ],
    ['the hook branches on every status', [SAVE], [], []],
    ['a status reaches only the final throw', [SAVE_403_THROWS], [], ['POST /api/recipes/ 403 (useSaveRecipe)']],
    [
      'the status it never branches on is listed',
      [SAVE_403_THROWS],
      [{ hook: 'useSaveRecipe', status: 403, ...REASON }],
      []
    ],
    [
      'another hook is listed for the status',
      [SAVE_403_THROWS],
      [{ hook: 'useAddRecipe', status: 403, ...REASON }],
      ['POST /api/recipes/ 403 (useSaveRecipe)']
    ],
    [
      'another hook in the file branches on the status',
      [`${ADD}\n${SAVE}`],
      [],
      ['POST /api/recipes/ 400 (useAddRecipe)', 'POST /api/recipes/ 403 (useAddRecipe)']
    ],
    [
      'two hooks share the endpoint and one is listed',
      [EDIT],
      [{ hook: 'useEditRecipe', status: 404, ...REASON }],
      ['PATCH /api/recipes/{slug}/ 404 (useRetitleRecipe)']
    ],
    ['the hook branches on what its helper requested', [REMOVE], [], []],
    [
      'an XMLHttpRequest makes the request',
      [UPLOAD],
      [],
      ['POST /api/photos/ 403 (useUploadPhoto)', 'POST /api/photos/ 503 (useUploadPhoto)']
    ],
    ['only a query calls the endpoint', [LIST], [], []]
  ])('lists what is unhandled when %s', (_, sources, unbranched, unhandled) => {
    expect(
      unhandledAnswers(PATHS, sources, unbranched).map(
        ({ method, path, status, hook }) => `${method} ${path} ${status} (${hook})`
      )
    ).toEqual(unhandled);
  });

  it('names the method, path, status and hook of what is unhandled', () => {
    const [unhandled] = unhandledAnswers(PATHS, [SAVE_403_THROWS], []);

    expect(unhandled && describeUnhandled(unhandled)).toBe(
      "POST /api/recipes/ 403 (useSaveRecipe): the hook has no `response.status === 403` branch, and UNBRANCHED doesn't list it"
    );
  });
});

describe('staleUnbranched', () => {
  it.each<[string, string[], Unbranched[], string[]]>([
    [
      'the listed status reaches only the final throw',
      [SAVE_403_THROWS],
      [{ hook: 'useSaveRecipe', status: 403, ...REASON }],
      []
    ],
    [
      'the hook now branches on the listed status',
      [SAVE],
      [{ hook: 'useSaveRecipe', status: 403, ...REASON }],
      ['useSaveRecipe 403']
    ],
    [
      'the endpoint does not document the listed status',
      [SAVE_403_THROWS],
      [{ hook: 'useSaveRecipe', status: 409, ...REASON }],
      ['useSaveRecipe 409']
    ],
    [
      'the XMLHttpRequest branches on one listed status',
      [UPLOAD],
      [
        { hook: 'useUploadPhoto', status: 400, ...REASON },
        { hook: 'useUploadPhoto', status: 503, ...REASON }
      ],
      ['useUploadPhoto 400']
    ],
    ['no source has the listed hook', [], [{ hook: 'useSaveRecipe', status: 403, ...REASON }], ['useSaveRecipe 403']]
  ])('lists the stale entries when %s', (_, sources, unbranched, stale) => {
    expect(staleUnbranched(PATHS, sources, unbranched).map(({ hook, status }) => `${hook} ${status}`)).toEqual(stale);
  });

  it('says why an entry is stale', () => {
    const [stale] = staleUnbranched(PATHS, [SAVE], [{ hook: 'useSaveRecipe', status: 403, ...REASON }]);

    expect(stale && describeStale(stale)).toBe(
      'useSaveRecipe 403: UNBRANCHED lists it, but the hook branches on it or makes no request documenting it'
    );
  });
});
