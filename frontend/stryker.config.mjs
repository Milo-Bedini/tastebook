// @ts-check
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: 'vitest',
  plugins: ['@stryker-mutator/vitest-runner', './scripts/mutation-progress-reporter.ts'],
  vitest: { configFile: 'vitest.mutation.config.ts' },
  // A mutant outside any function runs once, at import, so judging it means re-running every test: too slow for a
  // week's changes.
  ignoreStatic: true,
  // mutation-progress records each result as it comes, for scripts/mutation-test.ts to summarise a run it stops.
  reporters: ['mutation-progress', 'progress'],
  incremental: false,
  // Stryker rewrites the tsconfig with TypeScript's JS API, which TypeScript 7 doesn't have. Its references all stay
  // inside frontend/, so there's nothing to rewrite: naming no file skips the step.
  tsconfigFile: 'no-tsconfig.json'
};
