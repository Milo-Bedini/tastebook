import { parse } from 'yaml';

type Env = Record<string, unknown> | string | null | undefined;

// A job's container is an image name or an object; only the object form has an env.
type Container = { env?: Env } | string | null;

type Workflow = {
  env?: Env;
  jobs?: Record<string, { env?: Env; container?: Container } | null>;
};

const EXPRESSION = /\$\{\{([\s\S]*?)\}\}/g;
// `secrets` as a context of its own, not a property such as `inputs.secrets`.
const SECRETS_CONTEXT = /(?<![\w.-])secrets\b/;

const readsSecrets = (value: unknown): boolean =>
  typeof value === 'string' && [...value.matchAll(EXPRESSION)].some(([, body]) => SECRETS_CONTEXT.test(body ?? ''));

const envReadingSecrets = (env: Env, path: string): string[] => {
  if (env === undefined || env === null) {
    return [];
  }
  if (typeof env === 'string') {
    return readsSecrets(env) ? [path] : [];
  }
  return Object.entries(env)
    .filter(([, value]) => readsSecrets(value))
    .map(([name]) => `${path}.${name}`);
};

// The workflow's env, each job's env and each job container's env reach every step, so a secret there reaches code
// that doesn't need it. A service container's env doesn't reach the steps.
export const secretsOutsideSteps = (source: string): string[] => {
  const workflow = (parse(source) ?? {}) as Workflow;
  return [
    ...envReadingSecrets(workflow.env, 'env'),
    ...Object.entries(workflow.jobs ?? {}).flatMap(([id, job]) => [
      ...envReadingSecrets(job?.env, `jobs.${id}.env`),
      ...(typeof job?.container === 'object' ? envReadingSecrets(job.container?.env, `jobs.${id}.container.env`) : [])
    ])
  ];
};
