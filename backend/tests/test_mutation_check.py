import pytest

from mutation_check.known_mutants import portions, whole_grams

# The database is set up, as for most tests, so the check also covers mutants' runs sharing one.
pytestmark = pytest.mark.django_db


def test_portions_multiplies_servings() -> None:
    assert portions(4, 3) == 12


def test_whole_grams_drops_the_fraction() -> None:
    assert whole_grams(2.7) == 2
