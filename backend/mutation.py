"""Mutation-tests the backend source files given, and writes a JSON summary of the mutants no test noticed.

Usage, from the repo root: pnpm mutation:backend [--out summary.json] [--max-files N] <file> ...

Paths are relative to where the command is run (the repo root through pnpm). Anything that isn't backend source
(tests, migrations, the schema, data, frontend files, files since deleted) is skipped, so an empty or unrelated list
does nothing; --max-files then keeps the first N source files in the order given. Surviving mutants are findings,
not failures: the command exits 0 when they survive and fails only when mutmut itself can't run.
"""

import argparse
import ast
import json
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import TypedDict

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


def run(files: list[Path], cwd: Path, max_files: int | None) -> Summary:
    started = time.monotonic()
    roots = source_paths()
    sources = sorted(list(dict.fromkeys(file for file in files if is_source(file, roots)))[:max_files])
    summary: Summary = {
        'files': [os.path.relpath(file, cwd) for file in sources],
        'duration_seconds': 0.0,
        'mutants': 0,
        'survivors': [],
    }
    if not sources:
        return summary

    shutil.rmtree(MUTANTS_DIR, ignore_errors=True)
    write_config(roots, sources)
    try:
        result = mutmut('run')
        print(result.stdout, result.stderr, sep='\n', file=sys.stderr)
        no_tests_ran = NO_TESTS_RAN in result.stdout
        if result.returncode != 0 and not no_tests_ran:
            raise SystemExit(f'mutmut failed with exit code {result.returncode}')

        results = mutmut('results', '--all=true').stdout
        statuses = dict(match.groups() for match in re.finditer(r'^\s+(\S+): (.+)$', results, re.MULTILINE))
        if no_tests_ran:
            statuses = dict.fromkeys(statuses, 'no tests')
        files_by_module = {module_name(source): source for source in sources}
        summary['mutants'] = len(statuses)
        summary['survivors'] = sorted(
            (survivor(name, status, files_by_module, cwd) for name, status in statuses.items() if status in UNNOTICED),
            key=lambda found: (found['file'], found['line']),
        )
    finally:
        CONFIG_FILE.unlink(missing_ok=True)
    summary['duration_seconds'] = round(time.monotonic() - started, 1)
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--out', type=Path, help='where to write the JSON summary (printed when left out)')
    parser.add_argument('--max-files', type=int, help='mutate only the first N source files given')
    parser.add_argument('files', nargs='*', type=Path)
    args = parser.parse_args()
    if args.max_files is not None and args.max_files < 1:
        parser.error(f'--max-files takes a whole number above 0, not {args.max_files}')
    # pnpm runs scripts from the package's folder, and says where it was started in INIT_CWD.
    cwd = Path(os.environ.get('INIT_CWD', Path.cwd()))
    summary = run([(cwd / file).resolve() for file in args.files], cwd, args.max_files)
    text = json.dumps(summary, indent=2, ensure_ascii=False) + '\n'
    if args.out:
        (cwd / args.out).write_text(text)
    else:
        sys.stdout.write(text)


if __name__ == '__main__':
    main()
