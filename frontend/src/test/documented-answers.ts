// Which documented error answers of the mutations the app calls no page test answered through MSW, and which the
// calling hook never branches on. The paths are backend/schema.yml's, the sources the app's own files, and each answer
// "<METHOD> <pathname> <status>" as a test's handler sent it.

declare module 'vitest' {
  interface TaskMeta {
    // What this test's handlers answered, as "<METHOD> <pathname> <status>".
    answered?: string[];
  }
}

type Operation = { responses?: Record<string, unknown> };

export type Paths = Record<string, Partial<Record<string, Operation>>>;

export type MissingAnswer = { method: string; path: string; status: number; hooks: string[] };

export type UnhandledAnswer = { method: string; path: string; status: number; hook: string };

// A documented error answer a hook leaves to its final throw, so the page shows its failure message, and why.
export type Unbranched = { hook: string; status: number; reason: string };

const NOT_SENT = 'the app always sends the fields whose absence it refuses, so it would be a bug';
const NO_HOUSEHOLD = 'only an account with no household gets it, and the welcome page gives one before this page opens';
const SIGNED_OUT = 'signed out in another tab meanwhile, or a refused CSRF token: not asked again yet';

export const UNBRANCHED: Unbranched[] = [
  { hook: 'useChooseUnitSystem', status: 400, reason: 'the switch only sends the unit systems the API takes' },
  { hook: 'useChooseUnitSystem', status: 403, reason: SIGNED_OUT },
  { hook: 'useSaveName', status: 403, reason: SIGNED_OUT },
  { hook: 'useRenameHousehold', status: 403, reason: SIGNED_OUT },
  { hook: 'useRenameHousehold', status: 404, reason: NO_HOUSEHOLD },
  { hook: 'useRemoveMember', status: 403, reason: SIGNED_OUT },
  { hook: 'useLeaveHousehold', status: 403, reason: SIGNED_OUT },
  { hook: 'useLeaveHousehold', status: 404, reason: NO_HOUSEHOLD },
  { hook: 'useMakeInvite', status: 403, reason: SIGNED_OUT },
  { hook: 'useCancelInvite', status: 403, reason: SIGNED_OUT },
  { hook: 'useJoinHousehold', status: 403, reason: SIGNED_OUT },
  { hook: 'useSaveRecipe', status: 400, reason: NOT_SENT },
  { hook: 'useSaveTo', status: 400, reason: NOT_SENT }
];

// A hook's request is `api.<METHOD>('<path>'`, in the hook or in a module-level helper it calls. Its source is the
// hook's declaration with the helper's, so a status is matched per hook, not per file.
type Call = { hook: string; method: string; path: string; source: string };

type Declaration = { name: string; source: string };

const DECLARATION = /^(?:export )?const (\w+)/gm;

const CALL = /api\.(POST|PUT|PATCH|DELETE)\(\s*'([^']+)'/g;

const declarationsIn = (source: string): Declaration[] => {
  const starts = [...source.matchAll(DECLARATION)];
  return [
    { name: '(no hook)', source: source.slice(0, starts[0]?.index ?? source.length) },
    ...starts.map(({ 1: name = '', index }, at) => ({
      name,
      source: source.slice(index, starts[at + 1]?.index ?? source.length)
    }))
  ];
};

const isHook = (name: string): boolean => /^use[A-Z]/.test(name);

// The hooks that make a declaration's requests: itself, or the hooks in its file that call it.
const callersOf = (declaration: Declaration, declarations: Declaration[]): Declaration[] => {
  if (isHook(declaration.name)) {
    return [declaration];
  }
  const callers = declarations.filter(
    ({ name, source }) => isHook(name) && new RegExp(`\\b${declaration.name}\\(`).test(source)
  );
  return callers.length > 0 ? callers : [declaration];
};

const callsIn = (source: string): Call[] => {
  const declarations = declarationsIn(source);
  return declarations.flatMap((declaration) =>
    [...declaration.source.matchAll(CALL)].flatMap(([, method = '', path = '']) =>
      callersOf(declaration, declarations).map((caller) => ({
        hook: caller.name,
        method,
        path,
        source: caller === declaration ? caller.source : `${caller.source}${declaration.source}`
      }))
    )
  );
};

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

const branchesOn = (source: string, status: number): boolean =>
  new RegExp(`\\.status\\s*===\\s*${status}\\b`).test(source);

// Each request's documented error answers that its hook's source doesn't branch on.
const unbranchedAnswers = (paths: Paths, sources: string[]): UnhandledAnswer[] =>
  sources.flatMap(callsIn).flatMap(({ hook, method, path, source }) =>
    errorStatuses(paths[path]?.[method.toLowerCase()])
      .filter((status) => !branchesOn(source, status))
      .map((status) => ({ method, path, status, hook }))
  );

type HookStatus = { hook: string; status: number };

const isListed = (list: HookStatus[], { hook, status }: HookStatus): boolean =>
  list.some((entry) => entry.hook === hook && entry.status === status);

export const unhandledAnswers = (
  paths: Paths,
  sources: string[],
  unbranched: Unbranched[] = UNBRANCHED
): UnhandledAnswer[] => unbranchedAnswers(paths, sources).filter((answer) => !isListed(unbranched, answer));

// Entries whose hook now branches on the status, or no longer exists, so the table says only what's true.
export const staleUnbranched = (
  paths: Paths,
  sources: string[],
  unbranched: Unbranched[] = UNBRANCHED
): Unbranched[] => {
  const answers = unbranchedAnswers(paths, sources);
  return unbranched.filter((entry) => !isListed(answers, entry));
};

export const describeMissing = ({ method, path, status, hooks }: MissingAnswer): string =>
  `${method} ${path} ${status} (${hooks.join(', ')}): no page test answers it through MSW`;

export const describeUnhandled = ({ method, path, status, hook }: UnhandledAnswer): string =>
  `${method} ${path} ${status} (${hook}): the hook has no \`response.status === ${status}\` branch, and UNBRANCHED doesn't list it`;

export const describeStale = ({ hook, status }: Unbranched): string =>
  `${hook} ${status}: UNBRANCHED lists it, but the hook branches on it or makes no request documenting it`;
