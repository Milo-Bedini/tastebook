// Mutation-tests the frontend source files given, and writes a JSON summary of the mutants no test noticed.
// Usage, from the repo root: pnpm mutation:frontend [--out summary.json] <file> ...
// Paths are relative to where the command is run. Anything that isn't frontend source (tests, stories, generated
// types, test helpers, styles, backend files, files since deleted) is skipped, so an empty or unrelated list does
// nothing. Surviving mutants are findings, not failures: the command exits 0 when they survive.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';

type Position = { line: number; column: number };
type ReportMutant = {
  mutatorName: string;
  replacement?: string;
  status: string;
  location: { start: Position; end: Position };
};
type Report = { files: Record<string, { source: string; mutants: ReportMutant[] }> };
type Survivor = { file: string; line: number; change: string; status: 'survived' | 'no-coverage' };

const frontendDir = join(import.meta.dirname, '..');
const reportFile = join(frontendDir, 'reports', 'mutation', 'mutation.json');
const unnoticed: Record<string, Survivor['status']> = { Survived: 'survived', NoCoverage: 'no-coverage' };

// pnpm runs scripts from the package's folder, and says where it was started in INIT_CWD.
const cwd = process.env.INIT_CWD ?? process.cwd();
const { values, positionals } = parseArgs({ options: { out: { type: 'string' } }, allowPositionals: true });

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

const sources = [...new Set(positionals.map((file) => resolve(cwd, file)).filter((path) => isSource(path)))].sort();

const oneLine = (text: string) => text.split(/\s+/).join(' ').trim().slice(0, 200);

const original = (source: string, { start, end }: ReportMutant['location']) => {
  const lines = source.split('\n').slice(start.line - 1, end.line);
  const last = lines.length - 1;
  return lines.map((line, index) =>
    line.slice(index === 0 ? start.column - 1 : 0, index === last ? end.column - 1 : undefined)
  );
};

const survivors = (report: Report): Survivor[] =>
  Object.entries(report.files)
    .flatMap(([file, { source, mutants }]) =>
      mutants
        .filter((mutant) => mutant.status in unnoticed)
        .map((mutant) => ({
          file: relative(cwd, join(frontendDir, file)),
          line: mutant.location.start.line,
          change: `${oneLine(original(source, mutant.location).join(' '))} → ${oneLine(mutant.replacement ?? mutant.mutatorName)}`,
          status: unnoticed[mutant.status] ?? 'survived'
        }))
    )
    .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);

const run = () => {
  const started = performance.now();
  if (sources.length === 0) {
    return { mutants: 0, survivors: [], started };
  }
  rmSync(reportFile, { force: true });
  // Stryker's own output goes to stderr, so a summary printed to stdout stays readable JSON.
  execFileSync(
    'pnpm',
    ['exec', 'stryker', 'run', '--mutate', sources.map((path) => relative(frontendDir, path)).join(',')],
    {
      cwd: frontendDir,
      stdio: ['ignore', process.stderr, process.stderr]
    }
  );
  const report: Report = JSON.parse(readFileSync(reportFile, 'utf8'));
  // Static mutants are reported as Ignored (stryker.config.mjs says why); only the tested ones count.
  const mutants = Object.values(report.files)
    .flatMap((file) => file.mutants)
    .filter((mutant) => mutant.status !== 'Ignored');
  return { mutants: mutants.length, survivors: survivors(report), started };
};

const result = run();
const summary = {
  files: sources.map((path) => relative(cwd, path)),
  duration_seconds: Math.round((performance.now() - result.started) / 100) / 10,
  mutants: result.mutants,
  survivors: result.survivors
};
const text = `${JSON.stringify(summary, null, 2)}\n`;
if (values.out) {
  writeFileSync(resolve(cwd, values.out), text);
} else {
  process.stdout.write(text);
}
