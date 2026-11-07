import re
from dataclasses import dataclass

from django.conf import settings
from django.core.exceptions import ValidationError

# An original file on Wikimedia Commons, in a format Commons makes thumbnails of in the same format.
COMMONS_FILE = re.compile(
    r'^https://upload\.wikimedia\.org/wikipedia/commons/'
    r'(?P<directory>[0-9a-f]/[0-9a-f]{2})/(?P<name>[^/?#]+\.(?:jpe?g|png|webp))$',
    re.IGNORECASE,
)

COMMONS_HOST = 'https://upload.wikimedia.org/'

# The page that credits a file, which the recipe page links to as "Wikimedia Commons".
COMMONS_FILE_PAGE = re.compile(r'^https://commons\.wikimedia\.org/wiki/File:[^/?#]+$')

# Widths Commons keeps thumbnails at, from a card on a phone to a recipe's photo on a large screen.
THUMBNAIL_WIDTHS = (330, 500, 960, 1280)

# An uploaded photo is stored at each of these widths, the last its longest side at most (docs/architecture.md,
# Photos); the recipe keeps the address of the last.
UPLOADED_WIDTHS = (*THUMBNAIL_WIDTHS, 1600)

# A photo uploaded to a Vercel Blob store, under the environment that stored it and a name nobody can guess.
UPLOADED_PHOTO = re.compile(
    r'^https://(?P<store>[a-z0-9]+)\.public\.blob\.vercel-storage\.com/'
    r'recipes/(?P<environment>[a-z]+)/(?P<name>[A-Za-z0-9_-]{22})/1600\.webp$'
)

NOT_A_PHOTO_ADDRESS = (
    'Give the address of a JPEG, PNG or WebP file on Wikimedia Commons, '
    'starting https://upload.wikimedia.org/wikipedia/commons/, or of a photo uploaded to Tastebook.'
)


def photo_store() -> str:
    """The id of the Blob store this deployment uploads to, as its addresses have it; '' without a token."""
    # A read-write token is vercel_blob_rw_<store id>_<secret>.
    parts = settings.BLOB_READ_WRITE_TOKEN.split('_')
    return parts[3].lower() if len(parts) > 3 and parts[:3] == ['vercel', 'blob', 'rw'] else ''


def is_uploaded(url: str) -> bool:
    """Whether the address is a photo uploaded to this deployment's store, by any environment."""
    match = UPLOADED_PHOTO.match(url)
    return match is not None and photo_store() != '' and match['store'] == photo_store()


def validate_photo_address(url: str) -> None:
    if COMMONS_FILE.match(url) is None and not is_uploaded(url):
        # A code of its own, as the admin form swaps the default 'invalid' for "Enter a valid URL."
        raise ValidationError(NOT_A_PHOTO_ADDRESS, code='not_photo_address')


def uploaded_addresses(url: str) -> list[str]:
    """Every width an uploaded photo is stored at, smallest first."""
    return [url.removesuffix('/1600.webp') + f'/{width}.webp' for width in UPLOADED_WIDTHS]


@dataclass(frozen=True)
class Thumbnail:
    width: int
    url: str


@dataclass(frozen=True)
class PhotoCredit:
    author: str
    licence: str
    source_url: str


@dataclass(frozen=True)
class Photo:
    url: str
    author: str
    licence: str
    source_url: str

    @property
    def credit(self) -> PhotoCredit | None:
        """A Commons photo's credit, which its licence asks for; an uploaded photo has none."""
        if self.author == '':
            return None
        return PhotoCredit(self.author, self.licence, self.source_url)

    @property
    def thumbnails(self) -> list[Thumbnail]:
        if UPLOADED_PHOTO.match(self.url) is not None:
            return [
                Thumbnail(width, url) for width, url in zip(UPLOADED_WIDTHS, uploaded_addresses(self.url), strict=True)
            ]
        match = COMMONS_FILE.match(self.url)
        if match is None:
            return []
        directory, name = match['directory'], match['name']
        return [
            Thumbnail(
                width, f'https://upload.wikimedia.org/wikipedia/commons/thumb/{directory}/{name}/{width}px-{name}'
            )
            for width in THUMBNAIL_WIDTHS
        ]
