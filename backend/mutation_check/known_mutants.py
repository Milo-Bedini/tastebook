"""Code with known mutants, for the check that the mutation harness tells a noticed mutant from an unnoticed one.

The tests pass between 1 and 999 grams and 2 or more servings, so no test can notice a change to a line marked
`unnoticed`; they notice every other mutant.
"""


def portions(servings: int, per_serving: int) -> int:
    return max(1, servings) * per_serving  # unnoticed


def whole_grams(grams: float) -> int:
    floor = max(0, int(grams))  # unnoticed
    return min(floor, 1000)  # unnoticed
