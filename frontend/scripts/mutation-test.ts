// Mutation-tests the frontend source files given, and writes a JSON summary of the mutants no test noticed.
// Usage, from the repo root: pnpm mutation:frontend [--out summary.json] [--max-files N] [--time-limit M] <file> ...
// Paths are relative to where the command is run. Anything that isn't frontend source (tests, stories, generated
// types, test helpers, styles, backend files, files since deleted) is skipped, so an empty or unrelated list does
// nothing; --max-files then keeps the first N source files in the order given. --time-limit stops Stryker after M
// minutes and summarises the mutants tested so far, with "complete": false. Surviving mutants are findings, not
// failures: the command exits 0 when they survive.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { type ProgressRecord, progressFile, type TestedMutant } from './mutation-progress-reporter.ts';

type Survivor = { file: string; line: number; change: string; status: 'survived' | 'no-coverage' };

const frontendDir = join(import.meta.dirname, '..');
const unnoticed: Record<string, Survivor['status']> = { Survived: 'survived', NoCoverage: 'no-coverage' };
// Stryker gets this long to stop its test runners once told to, before they're killed.
const stopGraceMs = 10_000;

// pnpm runs scripts from the package's folder, and says where it was started in INIT_CWD.
const cwd = process.env.INIT_CWD ?? process.cwd();
const { values, positionals } = parseArgs({
  options: { out: { type: 'string' }, 'max-files': { type: 'string' }, 'time-limit': { type: 'string' } },
  allowPositionals: true
});
const wholeNumberOption = (name: 'max-files' | 'time-limit') => {
  const value = values[name] === undefined ? undefined : Number(values[name]);
  if (value !== undefined && !(Number.isInteger(value) && value > 0)) {
    throw new Error(`--${name} takes a whole number above 0, not ${values[name]}`);
  }
  return value;
};
const maxFiles = wholeNumberOption('max-files');
const timeLimit = wholeNumberOption('time-limit');

const isSource = (path: string) => {
  const fromFrontend = relative(frontendDir, path);
  return (
    fromFrontend.startsWith('src/') &&
    !fromFrontend.startsWith('src/test/') &&
    /\.tsx?$/.test(path) &&
    !/\.(test|stories|d)\.tsx?$/.test(path) &&
    existsSync(path)
  );
};

const sources = [...new Set(positionals.map((file) => resolve(cwd, file)).filter((path) => isSource(path)))]
  .slice(0, maxFiles)
  .sort();

const oneLine = (text: string) => text.split(/\s+/).join(' ').trim().slice(0, 200);

const original = (source: string, { start, end }: TestedMutant['location']) => {
  const lines = source.split('\n').slice(start.line - 1, end.line);
  const last = lines.length - 1;
  return lines.map((line, index) =>
    line.slice(index === 0 ? start.column - 1 : 0, index === last ? end.column - 1 : undefined)
  );
};

const survivors = (tested: TestedMutant[]): Survivor[] => {
  const found = tested.filter((mutant) => mutant.status in unnoticed);
  const paths = [...new Set(found.map((mutant) => resolve(frontendDir, mutant.fileName)))];
  const sourceOf = new Map(paths.map((path) => [path, readFileSync(path, 'utf8')]));
  return found
    .map((mutant) => {
      const path = resolve(frontendDir, mutant.fileName);
      return {
        file: relative(cwd, path),
        line: mutant.location.start.line,
        change: `${oneLine(original(sourceOf.get(path) ?? '', mutant.location).join(' '))} → ${oneLine(mutant.replacement ?? mutant.mutatorName)}`,
        status: unnoticed[mutant.status] ?? 'survived'
      };
    })
    .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
};

// Only whole lines count: a line Stryker was writing when it was stopped is left out.
const readProgress = (): ProgressRecord[] =>
  existsSync(progressFile)
    ? readFileSync(progressFile, 'utf8')
        .split('\n')
        .slice(0, -1)
        .map((line) => JSON.parse(line))
    : [];

// Resolves true when Stryker was stopped at the time limit, false when it finished.
const runStryker = (mutate: string, limit: AbortSignal | undefined) =>
  new Promise<boolean>((done, fail) => {
    // Stryker's own output goes to stderr, so a summary printed to stdout stays readable JSON. Its own process group,
    // so stopping it stops its test runners too.
    const stryker = spawn('pnpm', ['exec', 'stryker', 'run', '--mutate', mutate], {
      cwd: frontendDir,
      stdio: ['ignore', 2, 2],
      detached: true
    });
    const signalGroup = (signal: NodeJS.Signals) => {
      try {
        process.kill(-(stryker.pid ?? 0), signal);
      } catch {
        // The group has already exited.
      }
    };
    limit?.addEventListener('abort', () => {
      process.stderr.write(`\nStopping Stryker at the ${timeLimit}-minute time limit.\n`);
      signalGroup('SIGTERM');
      setTimeout(() => signalGroup('SIGKILL'), stopGraceMs).unref();
    });
    stryker.on('error', fail);
    stryker.on('close', (code) => {
      if (limit?.aborted) {
        signalGroup('SIGKILL');
        done(true);
      } else if (code === 0) {
        done(false);
      } else {
        fail(new Error(`Stryker failed with exit code ${code}`));
      }
    });
  });

const run = async () => {
  const started = performance.now();
  if (sources.length === 0) {
    return { started, stopped: false, records: [] };
  }
  rmSync(progressFile, { force: true });
  const limit = timeLimit === undefined ? undefined : AbortSignal.timeout(timeLimit * 60_000);
  const stopped = await runStryker(sources.map((path) => relative(frontendDir, path)).join(','), limit);
  return { started, stopped, records: readProgress() };
};

const result = await run();
const tested = result.records.flatMap((record) => ('tested' in record ? [record.tested] : []));
const total = result.records.reduce((count, record) => ('total' in record ? record.total : count), 0);
const summary = {
  files: sources.map((path) => relative(cwd, path)),
  duration_seconds: Math.round((performance.now() - result.started) / 100) / 10,
  mutants: tested.length,
  complete: !result.stopped,
  ...(result.stopped ? { mutants_tested: tested.length, mutants_total: total } : {}),
  survivors: survivors(tested)
};
const text = `${JSON.stringify(summary, null, 2)}\n`;
if (values.out) {
  writeFileSync(resolve(cwd, values.out), text);
} else {
  process.stdout.write(text);
}
