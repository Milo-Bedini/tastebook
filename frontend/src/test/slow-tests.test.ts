import { describe, expect, it } from 'vitest';

import { slowTests, type TestRun } from './slow-tests';

const run = (name: string, duration: number, timeout = 5_000): TestRun => ({ name, duration, timeout });

describe('slowTests', () => {
  it.each<[string, TestRun[], string[]]>([
    ['every test is quick', [run('a > quick', 120), run('a > quicker', 8)], []],
    ['a test takes exactly 3 s', [run('a > on the line', 3_000)], []],
    ['a test takes just over 3 s', [run('a > over the line', 3_001)], ['a > over the line (3.0 s)']],
    ['a slow test sets a timeout of its own', [run('a > slow on purpose', 4_200, 15_000)], []],
    ['a slow test sets a shorter timeout of its own', [run('a > tight', 3_400, 4_000)], []],
    [
      'two tests are slow among quick ones',
      [run('a > slow', 3_250), run('a > quick', 400), run('b > slower', 4_960)],
      ['b > slower (5.0 s)', 'a > slow (3.3 s)']
    ]
  ])('lists the slow tests, slowest first, when %s', (_, runs, slow) => {
    expect(slowTests(runs, 5_000)).toEqual(slow);
  });

  it('counts a test as having its own timeout only when it differs from the default', () => {
    expect(slowTests([run('a > slow', 3_500, 10_000)], 10_000)).toEqual(['a > slow (3.5 s)']);
  });
});
