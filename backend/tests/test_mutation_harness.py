import json
from pathlib import Path

import pytest

from mutation_check.harness import check, main

KNOWN_MUTANTS = 'known_mutants.py'
UNNOTICED_ON_LINES = (
    "known_mutants.py's unnoticed mutants should be reported survived on lines [2, 6, 7], not {}: "
    'the harness counts mutants no test noticed as killed, or the reverse.'
)
NONE_KILLED = (
    'No mutant of known_mutants.py was reported killed, though its tests notice all but those marked unnoticed.'
)


@pytest.fixture(autouse=True)
def known_mutants(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.chdir(tmp_path)
    (tmp_path / KNOWN_MUTANTS).write_text(
        'def portions(servings: int, per_serving: int) -> int:\n'
        '    return max(1, servings) * per_serving  # unnoticed\n'
        '\n'
        '\n'
        'def whole_grams(grams: float) -> int:\n'
        '    floor = max(0, int(grams))  # unnoticed\n'
        '    return min(floor, 1000)  # unnoticed\n'
    )


def summary(mutants: int, survivors: list[tuple[str, int, str]]) -> dict:
    return {
        'files': [KNOWN_MUTANTS],
        'duration_seconds': 600.0,
        'mutants': mutants,
        'complete': True,
        'survivors': [
            {'file': file, 'line': line, 'change': 'max(1, servings) → min(1, servings)', 'status': status}
            for file, line, status in survivors
        ],
    }


@pytest.mark.parametrize(
    ('mutants', 'survivors', 'expected'),
    [
        pytest.param(
            12,
            [
                (KNOWN_MUTANTS, 7, 'survived'),
                (KNOWN_MUTANTS, 2, 'survived'),
                (KNOWN_MUTANTS, 6, 'survived'),
                (KNOWN_MUTANTS, 3, 'no-coverage'),
                ('recipes/services.py', 6, 'survived'),
            ],
            [],
            id='each marked line survived once, beside other statuses and files',
        ),
        pytest.param(
            12,
            [(KNOWN_MUTANTS, line, 'survived') for line in (2, 6, 6, 7)],
            [UNNOTICED_ON_LINES.format('[2, 6, 6, 7]')],
            id='a noticed mutant reported survived on a marked line',
        ),
        pytest.param(
            12,
            [(KNOWN_MUTANTS, 2, 'survived'), (KNOWN_MUTANTS, 7, 'survived'), ('recipes/services.py', 6, 'survived')],
            [UNNOTICED_ON_LINES.format('[2, 7]')],
            id='an unnoticed mutant reported killed',
        ),
        pytest.param(
            12,
            [(KNOWN_MUTANTS, 2, 'survived'), (KNOWN_MUTANTS, 6, 'no-coverage'), (KNOWN_MUTANTS, 7, 'survived')],
            [UNNOTICED_ON_LINES.format('[2, 7]')],
            id='an unnoticed mutant no test ran',
        ),
        pytest.param(
            12,
            [(KNOWN_MUTANTS, line, 'survived') for line in (2, 3, 6, 7)],
            [UNNOTICED_ON_LINES.format('[2, 3, 6, 7]')],
            id='a noticed mutant reported survived on an unmarked line',
        ),
        pytest.param(
            3,
            [(KNOWN_MUTANTS, line, 'survived') for line in (2, 6, 7)],
            [NONE_KILLED],
            id='no mutant killed',
        ),
        pytest.param(0, [], [UNNOTICED_ON_LINES.format('[]'), NONE_KILLED], id='no mutant tested'),
    ],
)
def test_the_harness_check_fails_when_the_summary_mixes_up_noticed_and_unnoticed_mutants(
    mutants: int, survivors: list[tuple[str, int, str]], expected: list[str]
) -> None:
    assert check(summary(mutants, survivors), KNOWN_MUTANTS) == expected


@pytest.mark.parametrize(
    ('survivors', 'exit_code', 'output'),
    [
        ([(KNOWN_MUTANTS, line, 'survived') for line in (2, 6, 7)], 0, ''),
        (
            [(KNOWN_MUTANTS, line, 'survived') for line in (2, 2, 6, 7)],
            1,
            f'::error::{UNNOTICED_ON_LINES.format("[2, 2, 6, 7]")}\n',
        ),
    ],
)
def test_the_harness_check_prints_each_failure_as_an_actions_error(
    capsys: pytest.CaptureFixture[str], survivors: list[tuple[str, int, str]], exit_code: int, output: str
) -> None:
    Path('mutation-check.json').write_text(json.dumps(summary(12, survivors)))

    assert (main(['mutation-check.json', KNOWN_MUTANTS]), capsys.readouterr().out) == (exit_code, output)
