import { globSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import type { TestProject } from 'vitest/node';
import { parse } from 'yaml';

import { describeMissing, missingAnswers, type Paths } from './src/test/documented-answers.ts';

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
  if (missing.length > 0) {
    throw new Error(
      `Each documented error answer of a mutation needs a page test that answers it with server.use(...):\n${missing
        .map(describeMissing)
        .join('\n')}`
    );
  }
};
