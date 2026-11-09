"""Mutation-tests the backend source files given, and writes a JSON summary of the mutants no test noticed.

Usage, from the repo root: pnpm mutation:backend [--out summary.json] [--max-files N] [--time-limit M] <file> ...

Paths are relative to where the command is run (the repo root through pnpm). Anything that isn't backend source
(tests, migrations, the schema, data, frontend files, files since deleted) is skipped, so an empty or unrelated list
does nothing; --max-files then keeps the first N source files in the order given. --time-limit stops mutmut after M
minutes and summarises the mutants tested so far, with "complete": false. Surviving mutants are findings, not
failures: the command exits 0 when they survive and fails only when mutmut itself can't run.
"""

import argparse
import ast
import contextlib
import json
import os
import re
import shutil
import signal
import subprocess
import sys
import time
from pathlib import Path
from typing import NotRequired, TypedDict

BACKEND_DIR = Path(__file__).resolve().parent
# mutmut reads its settings from pyproject.toml or, when that has none, setup.cfg; the file list changes every run,
# so they're written here for the run and removed after.
CONFIG_FILE = BACKEND_DIR / 'setup.cfg'
MUTANTS_DIR = BACKEND_DIR / 'mutants'
NOT_MUTATED_DIRS = {'tests', 'migrations', 'mutants', '.venv'}
NOT_MUTATED_FILES = {'manage.py', Path(__file__).name}
# mutmut stops with this when no test runs the mutated code at all: every mutant then survives.
NO_TESTS_RAN = 'could not find any test case for any mutant'
UNNOTICED = {'survived': 'survived', 'no tests': 'no-coverage'}
# What mutmut reports for a mutant it hadn't finished testing when it was stopped.
UNTESTED = {'not checked', 'check was interrupted by user'}
# mutmut gets this long to stop its workers once interrupted, before they're killed.
STOP_GRACE_SECONDS = 30
Definition = ast.FunctionDef | ast.AsyncFunctionDef | ast.ClassDef


class Survivor(TypedDict):
    file: str
    line: int
    change: str
    status: str


class Summary(TypedDict):
    files: list[str]
    duration_seconds: float
    mutants: int
    complete: bool
    mutants_tested: NotRequired[int]
    mutants_total: NotRequired[int]
    survivors: list[Survivor]


def source_paths() -> list[str]:
    """Every package and module the tests import, since mutmut runs them from a copy holding only these."""
    packages = [
        path.name
        for path in BACKEND_DIR.iterdir()
        if path.is_dir() and path.name not in NOT_MUTATED_DIRS and (path / '__init__.py').exists()
    ]
    modules = [path.name for path in BACKEND_DIR.glob('*.py') if path.name not in NOT_MUTATED_FILES]
    return sorted(packages + modules)


def is_source(path: Path, roots: list[str]) -> bool:
    try:
        relative = path.relative_to(BACKEND_DIR)
    except ValueError:
        return False
    return (
        path.suffix == '.py'
        and path.is_file()
        and relative.parts[0] in roots
        and not NOT_MUTATED_DIRS.intersection(relative.parts)
        and not relative.name.startswith('test_')
        and relative.name != 'conftest.py'
    )


def write_config(roots: list[str], files: list[Path]) -> None:
    lines = [
        '[mutmut]',
        'source_paths=',
        *(f'    {root}' for root in roots),
        'only_mutate=',
        *(f'    {file.relative_to(BACKEND_DIR)}' for file in files),
        # pytest-django puts the folder holding manage.py on the import path; with a copy in the sandbox, that's the
        # mutated code rather than the original.
        'also_copy=',
        '    manage.py',
        # A mutant that loops for ever (say, in first_free_slug) otherwise gets 30 times its tests' time, minutes each.
        'timeout_multiplier=3',
    ]
    CONFIG_FILE.write_text('\n'.join(lines) + '\n')


def mutmut(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, '-m', 'mutmut', *args], cwd=BACKEND_DIR, capture_output=True, text=True, check=False
    )


def run_mutmut(time_limit: float | None) -> tuple[subprocess.CompletedProcess[str], bool]:
    """Runs `mutmut run`, interrupting it after time_limit seconds; says whether it was stopped."""
    # Its own session, so its workers can be killed with it when they outlast the interrupt.
    process = subprocess.Popen(
        [sys.executable, '-m', 'mutmut', 'run'],
        cwd=BACKEND_DIR,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        start_new_session=True,
    )
    try:
        stdout, stderr = process.communicate(timeout=time_limit)
    except subprocess.TimeoutExpired:
        # mutmut stops its workers on Ctrl-C; every result it had by then is already in its .meta files.
        process.send_signal(signal.SIGINT)
        try:
            stdout, stderr = process.communicate(timeout=STOP_GRACE_SECONDS)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            stdout, stderr = process.communicate()
        # A worker still testing a mutant would otherwise outlive the run.
        with contextlib.suppress(ProcessLookupError):
            os.killpg(process.pid, signal.SIGKILL)
        return subprocess.CompletedProcess(process.args, process.returncode, stdout, stderr), True
    return subprocess.CompletedProcess(process.args, process.returncode, stdout, stderr), False


def function_line(source: Path, mangled: str) -> int:
    """The line of the function a mutant name points at: `x_name` for a function, `xǁClassǁname` for a method."""
    names = mangled.removeprefix('x_').removeprefix('xǁ').split('ǁ')
    scope: list[ast.stmt] = ast.parse(source.read_text()).body
    line = 1
    for name in names:
        found = next((node for node in scope if isinstance(node, Definition) and node.name == name), None)
        if found is None:
            break
        scope, line = found.body, found.lineno
    return line


def one_line(lines: list[str]) -> str:
    return ' '.join(' '.join(line.split()) for line in lines)[:200]


def survivor(name: str, status: str, files_by_module: dict[str, Path], cwd: Path) -> Survivor:
    module = name[: name.index('.x')]
    mangled = name[len(module) + 1 : name.rindex('__mutmut_')]
    source = files_by_module[module]
    # mutmut shows a mutant as a diff of its function alone, so the hunk's lines count from the function's first line.
    diff = mutmut('show', name).stdout.splitlines()
    body = [line for line in diff if not line.startswith(('---', '+++', '@@', '#'))]
    removed_at = next((index for index, line in enumerate(body) if line.startswith('-')), 0)
    removed = [line[1:] for line in body if line.startswith('-')]
    added = [line[1:] for line in body if line.startswith('+')]
    return {
        'file': os.path.relpath(source, cwd),
        'line': function_line(source, mangled) + removed_at,
        'change': f'{one_line(removed)} → {one_line(added)}',
        'status': UNNOTICED[status],
    }


def module_name(path: Path) -> str:
    return '.'.join(path.relative_to(BACKEND_DIR).with_suffix('').parts).removesuffix('.__init__')


def run(files: list[Path], cwd: Path, max_files: int | None, time_limit: int | None) -> Summary:
    started = time.monotonic()
    roots = source_paths()
    sources = sorted(list(dict.fromkeys(file for file in files if is_source(file, roots)))[:max_files])
    if not sources:
        return {'files': [], 'duration_seconds': 0.0, 'mutants': 0, 'complete': True, 'survivors': []}

    shutil.rmtree(MUTANTS_DIR, ignore_errors=True)
    write_config(roots, sources)
    try:
        result, stopped = run_mutmut(None if time_limit is None else time_limit * 60 - (time.monotonic() - started))
        print(result.stdout, result.stderr, sep='\n', file=sys.stderr)
        no_tests_ran = NO_TESTS_RAN in result.stdout
        if result.returncode != 0 and not no_tests_ran and not stopped:
            raise SystemExit(f'mutmut failed with exit code {result.returncode}')

        results = mutmut('results', '--all=true').stdout
        statuses = dict(match.groups() for match in re.finditer(r'^\s+(\S+): (.+)$', results, re.MULTILINE))
        if no_tests_ran:
            statuses = dict.fromkeys(statuses, 'no tests')
        tested = {name: status for name, status in statuses.items() if status not in UNTESTED}
        files_by_module = {module_name(source): source for source in sources}
        survivors = sorted(
            (survivor(name, status, files_by_module, cwd) for name, status in tested.items() if status in UNNOTICED),
            key=lambda found: (found['file'], found['line']),
        )
    finally:
        CONFIG_FILE.unlink(missing_ok=True)
    progress = {'mutants_tested': len(tested), 'mutants_total': len(statuses)} if stopped else {}
    return {
        'files': [os.path.relpath(file, cwd) for file in sources],
        'duration_seconds': round(time.monotonic() - started, 1),
        'mutants': len(tested),
        'complete': not stopped,
        **progress,
        'survivors': survivors,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--out', type=Path, help='where to write the JSON summary (printed when left out)')
    parser.add_argument('--max-files', type=int, help='mutate only the first N source files given')
    parser.add_argument('--time-limit', type=int, help='stop after M minutes and summarise the mutants tested so far')
    parser.add_argument('files', nargs='*', type=Path)
    args = parser.parse_args()
    for option, value in (('--max-files', args.max_files), ('--time-limit', args.time_limit)):
        if value is not None and value < 1:
            parser.error(f'{option} takes a whole number above 0, not {value}')
    # pnpm runs scripts from the package's folder, and says where it was started in INIT_CWD.
    cwd = Path(os.environ.get('INIT_CWD', Path.cwd()))
    summary = run([(cwd / file).resolve() for file in args.files], cwd, args.max_files, args.time_limit)
    text = json.dumps(summary, indent=2, ensure_ascii=False) + '\n'
    if args.out:
        (cwd / args.out).write_text(text)
    else:
        sys.stdout.write(text)


if __name__ == '__main__':
    main()
