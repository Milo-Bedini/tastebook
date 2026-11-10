"""Checks a mutation summary of the known mutants: the harness must tell a noticed mutant from an unnoticed one.

Usage, from the repo root: uv run --project backend python backend/mutation_check/harness.py <summary.json> <known>

<known> is the known mutants' file as the summary names it. The lines marked `# unnoticed` there must be exactly the
lines reported survived, once each, and at least one mutant must be reported killed. Exits 1 with a GitHub Actions
error for each failure.
"""

import json
import sys
from pathlib import Path
from typing import TYPE_CHECKING

# Only for the types: mutmut runs the tests from a copy that leaves mutation.py out.
if TYPE_CHECKING:
    from mutation import Summary

UNNOTICED_MARK = '# unnoticed'


def check(summary: Summary, known_mutants: str) -> list[str]:
    """The ways the summary shows the harness can't tell a noticed mutant from an unnoticed one, or none."""
    lines = Path(known_mutants).read_text().splitlines()
    expected = [number for number, line in enumerate(lines, start=1) if line.endswith(UNNOTICED_MARK)]
    reported = sorted(
        survivor['line']
        for survivor in summary['survivors']
        if survivor['file'] == known_mutants and survivor['status'] == 'survived'
    )
    errors = []
    # Both in order and neither deduplicated, so a noticed mutant reported survived on a marked line still shows.
    if reported != expected:
        errors.append(
            f"{known_mutants}'s unnoticed mutants should be reported survived on lines {json.dumps(expected)}, "
            f'not {json.dumps(reported)}: the harness counts mutants no test noticed as killed, or the reverse.'
        )
    if summary['mutants'] <= len(summary['survivors']):
        errors.append(
            f'No mutant of {known_mutants} was reported killed, though its tests notice all but those marked unnoticed.'
        )
    return errors


def main(argv: list[str]) -> int:
    summary_path, known_mutants = argv
    errors = check(json.loads(Path(summary_path).read_text()), known_mutants)
    for error in errors:
        print(f'::error::{error}')
    return 1 if errors else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
