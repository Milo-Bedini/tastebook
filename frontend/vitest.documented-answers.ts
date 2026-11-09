import { globSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import type { TestProject } from 'vitest/node';
import { parse } from 'yaml';

import {
  describeMissing,
  describeStale,
  describeUnhandled,
  missingAnswers,
  type Paths,
  staleUnbranched,
  unhandledAnswers
} from './src/test/documented-answers.ts';

// The unit project's global setup: once every page test has run, fails the run if a documented error answer of a
// mutation the app calls was answered by none of them (src/test/setup.ts records what each test's handlers sent), or
// its hook neither branches on it nor lists it in UNBRANCHED with a reason.
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
  const problems = [
    ...missingAnswers(schema.paths, sources, answered).map(describeMissing),
    ...unhandledAnswers(schema.paths, sources).map(describeUnhandled),
    ...staleUnbranched(schema.paths, sources).map(describeStale)
  ];
  if (problems.length > 0) {
    throw new Error(
      'Each documented error answer of a mutation needs a page test that answers it with server.use(...), and a ' +
        '`response.status === N` branch in its hook or an UNBRANCHED entry in src/test/documented-answers.ts saying ' +
        `why the failure message is right:\n${problems.join('\n')}`
    );
  }
};
