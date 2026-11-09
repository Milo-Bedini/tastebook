import type { TestProject } from 'vitest/node';

import { SLOW_TEST_MS, slowTests } from './src/test/slow-tests.ts';

// The unit project's global setup: once its tests have run, fails the run if one took over SLOW_TEST_MS without a
// timeout of its own (src/test/slow-tests.ts says why).
export const setup = (project: TestProject) => () => {
  const { testTimeout } = project.config;
  const runs = project.vitest.state
    .getTestModules()
    .filter((module) => module.project.name === project.name)
    .flatMap((module) =>
      [...module.children.allTests()].map((test) => ({
        name: `${module.relativeModuleId} > ${test.fullName}`,
        duration: test.diagnostic()?.duration ?? 0,
        timeout: test.options.timeout ?? testTimeout
      }))
    );
  const slow = slowTests(runs, testTimeout);
  if (slow.length > 0) {
    throw new Error(
      `Unit tests over ${SLOW_TEST_MS / 1_000} s, close to the ${testTimeout / 1_000} s timeout: split each into smaller tests, or give one that's slow on purpose a timeout of its own (it(name, { timeout: 15_000 }, ...)).\n${slow.join('\n')}`
    );
  }
};
