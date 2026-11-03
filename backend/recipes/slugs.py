import secrets
from collections.abc import Container
from itertools import chain, count

from django.utils.text import slugify


def base_slug(title: str) -> str:
    # A title with no letters or digits (say '!!!') slugifies to ''.
    return slugify(title) or 'recipe'


def first_free_slug(base: str, taken: Container[str]) -> str:
    candidates = chain([base], (f'{base}-{n}' for n in count(2)))
    return next(candidate for candidate in candidates if candidate not in taken)


# No i, l, o, 0 or 1, which read alike.
SUFFIX_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'


def random_suffix() -> str:
    return ''.join(secrets.choice(SUFFIX_ALPHABET) for _ in range(6))
