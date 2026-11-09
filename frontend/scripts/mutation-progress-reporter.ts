// A Stryker reporter that appends the run's mutant count, then each mutant's result as it's tested, to progressFile,
// one JSON object a line. Stryker writes its own reports only once every mutant is tested, so this is what lets
// scripts/mutation-test.ts summarise a run it stopped at its time limit.
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

type Position = { line: number; column: number };
export type TestedMutant = {
  fileName: string;
  mutatorName: string;
  replacement?: string;
  status: string;
  location: { start: Position; end: Position };
};
export type ProgressRecord = { total: number } | { tested: TestedMutant };
type Plan = { mutant: { status?: string } };

export const progressFile = join(import.meta.dirname, '..', 'reports', 'mutation', 'progress.ndjson');

const append = (record: ProgressRecord) => appendFileSync(progressFile, `${JSON.stringify(record)}\n`);

export const strykerPlugins = [
  {
    kind: 'Reporter',
    name: 'mutation-progress',
    value: {
      // Static mutants are Ignored (stryker.config.mjs says why); only the ones to be tested count.
      onMutationTestingPlanReady: ({ mutantPlans }: { mutantPlans: readonly Plan[] }) => {
        mkdirSync(dirname(progressFile), { recursive: true });
        append({ total: mutantPlans.filter(({ mutant }) => mutant.status !== 'Ignored').length });
      },
      onMutantTested: ({ fileName, mutatorName, replacement, status, location }: TestedMutant) => {
        if (status !== 'Ignored') {
          append({ tested: { fileName, mutatorName, replacement, status, location } });
        }
      }
    }
  }
];
