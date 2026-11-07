import createClient from 'openapi-fetch';

import type { paths } from './schema';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const csrfToken = (): string | undefined =>
  document.cookie
    .split('; ')
    .find((cookie) => cookie.startsWith('csrftoken='))
    ?.slice('csrftoken='.length);

export const apiBaseUrl: string = import.meta.env.VITE_API_URL ?? window.location.origin;

export const api = createClient<paths>({
  baseUrl: apiBaseUrl,
  // Resolve fetch per request so MSW's interception (patched after import) applies in tests.
  fetch: (request) => globalThis.fetch(request)
});

// Django checks CSRF on a signed-in account's unsafe requests; GET /api/account/ sets the cookie on every page.
api.use({
  onRequest: ({ request }) => {
    const token = csrfToken();
    if (!SAFE_METHODS.has(request.method) && token !== undefined) {
      request.headers.set('X-CSRFToken', token);
    }
    return request;
  }
});
