// Which documented error answers of the mutations the app calls no page test answered through MSW. The paths are
// backend/schema.yml's, the sources the app's own files, and each answer "<METHOD> <pathname> <status>" as a test's
// handler sent it.

declare module 'vitest' {
  interface TaskMeta {
    // What this test's handlers answered, as "<METHOD> <pathname> <status>".
    answered?: string[];
  }
}

type Operation = { responses?: Record<string, unknown> };

export type Paths = Record<string, Partial<Record<string, Operation>>>;

export type MissingAnswer = { method: string; path: string; status: number; hooks: string[] };

type Call = { hook: string; method: string; path: string };

// A hook's request is `api.<METHOD>('<path>'`, after the `export const use…` it belongs to.
const CALL = /export const (use\w+)|api\.(POST|PUT|PATCH|DELETE)\(\s*'([^']+)'/g;

const callsIn = (source: string): Call[] =>
  [...source.matchAll(CALL)].reduce<{ hook: string; calls: Call[] }>(
    ({ hook, calls }, [, name, method = '', path = '']) =>
      name === undefined ? { hook, calls: [...calls, { hook, method, path }] } : { hook: name, calls },
    { hook: '(no hook)', calls: [] }
  ).calls;

const errorStatuses = (operation: Operation | undefined): number[] =>
  Object.keys(operation?.responses ?? {})
    .filter((status) => /^[1345]\d\d$/.test(status))
    .map(Number);

const matches = (path: string, pathname: string): boolean =>
  new RegExp(`^${path.replaceAll(/\{[^}]+\}/g, '[^/]+')}$`).test(pathname);

const isAnswered = (answered: string[], method: string, path: string, status: number): boolean =>
  answered.some((answer) => {
    const [answeredMethod, pathname = '', answeredStatus] = answer.split(' ');
    return answeredMethod === method && answeredStatus === String(status) && matches(path, pathname);
  });

export const missingAnswers = (paths: Paths, sources: string[], answered: string[]): MissingAnswer[] => {
  const calls = sources.flatMap(callsIn);
  const endpoints = [...new Set(calls.map(({ method, path }) => `${method} ${path}`))].sort();
  return endpoints.flatMap((endpoint) => {
    const [method = '', path = ''] = endpoint.split(' ');
    const hooks = [
      ...new Set(calls.filter((call) => `${call.method} ${call.path}` === endpoint).map(({ hook }) => hook))
    ];
    return errorStatuses(paths[path]?.[method.toLowerCase()])
      .filter((status) => !isAnswered(answered, method, path, status))
      .map((status) => ({ method, path, status, hooks }));
  });
};

export const describeMissing = ({ method, path, status, hooks }: MissingAnswer): string =>
  `${method} ${path} ${status} (${hooks.join(', ')}): no page test answers it through MSW`;
