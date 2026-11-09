// Which unit tests ran close to Vitest's timeout. A test that takes over SLOW_TEST_MS on CI's runner passes until a
// busier run pushes it past the timeout and fails an unrelated PR. A test that's slow on purpose sets a timeout of its
// own, so it isn't listed.
export const SLOW_TEST_MS = 3_000;

export type TestRun = { name: string; duration: number; timeout: number };

export const slowTests = (runs: TestRun[], defaultTimeout: number): string[] =>
  runs
    .filter(({ duration, timeout }) => duration > SLOW_TEST_MS && timeout === defaultTimeout)
    .sort((a, b) => b.duration - a.duration)
    .map(({ name, duration }) => `${name} (${(duration / 1_000).toFixed(1)} s)`);
