import { globSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import type { TestProject } from 'vitest/node';
import { parse } from 'yaml';

import { describeMissing, missingAnswers, type Paths } from './src/test/documented-answers.ts';

const UNDECIDED = 'the page shows its "Check your connection" toast; how it should answer is asked on TAS-165';

// Answers left without a page test, each with why. Take one off once a test answers it: the check fails until then.
const LEFT_OUT: Record<string, string> = {
  'DELETE /api/household/invite/ 403': UNDECIDED,
  'DELETE /api/household/members/{member_id}/ 403': UNDECIDED,
  'PATCH /api/account/ 403': UNDECIDED,
  'PATCH /api/household/ 403': UNDECIDED,
  'PATCH /api/household/ 404': UNDECIDED,
  'POST /api/household/invite/ 403': UNDECIDED,
  'POST /api/household/leave/ 403': UNDECIDED,
  'POST /api/household/leave/ 404': UNDECIDED,
  'POST /api/invites/{token}/join/ 403': UNDECIDED
};

// The unit project's global setup: once every page test has run, fails the run if a documented error answer of a
// mutation the app calls was answered by none of them (src/test/setup.ts records what each test's handlers sent).
export const setup = (project: TestProject) => async () => {
  const { vitest } = project;
  const { testFiles } = await project.globTestFiles();
  const modules = vitest.state.getTestModules().filter((module) => module.project.name === project.name);
  // A run of some files or some tests (or watch mode) leaves answers out by design, so only a whole run is checked.
  if (vitest.config.watch || vitest.config.testNamePattern !== undefined || modules.length < testFiles.length) {
    return;
  }
  const schema = parse(await readFile(new URL('../backend/schema.yml', import.meta.url), 'utf8')) as { paths: Paths };
  const sourceFiles = globSync('src/**/*.{ts,tsx}', { cwd: project.config.root }).filter(
    (file) => !/\.(test|stories)\.tsx?$/.test(file)
  );
  const sources = await Promise.all(sourceFiles.map((file) => readFile(`${project.config.root}/${file}`, 'utf8')));
  const answered = modules.flatMap((module) =>
    [...module.children.allTests()].flatMap((test) => test.meta().answered ?? [])
  );
  const missing = missingAnswers(schema.paths, sources, answered);
  const keys = missing.map(({ method, path, status }) => `${method} ${path} ${status}`);
  const untested = missing.filter((_, index) => LEFT_OUT[keys[index] ?? ''] === undefined).map(describeMissing);
  const tested = Object.keys(LEFT_OUT)
    .filter((key) => !keys.includes(key))
    .map((key) => `${key}: a page test answers it now, so take it off LEFT_OUT in vitest.documented-answers.ts`);
  if (untested.length > 0 || tested.length > 0) {
    throw new Error(
      `Each documented error answer of a mutation needs a page test that answers it with server.use(...):\n${[
        ...untested,
        ...tested
      ].join('\n')}`
    );
  }
};
