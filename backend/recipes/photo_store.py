"""Storing the photos people upload in Vercel Blob, through its HTTP API (the protocol @vercel/blob speaks)."""

import io
import logging
import secrets
from typing import IO

import requests
from django.conf import settings
from PIL import Image, ImageOps, UnidentifiedImageError
from pillow_heif import register_heif_opener

from recipes.photos import UPLOADED_PHOTO, UPLOADED_WIDTHS, Photo, is_uploaded, photo_store, uploaded_addresses

register_heif_opener()

logger = logging.getLogger(__name__)

BLOB_API = 'https://vercel.com/api/blob'
BLOB_API_VERSION = '13'
BLOB_TIMEOUT_SECONDS = 20

MAX_PHOTO_BYTES = 10 * 1024 * 1024
# A 48-megapixel phone camera's photo, with room to spare; decoding more would risk the function's memory.
MAX_PHOTO_PIXELS = 60_000_000
FORMATS = {'JPEG', 'PNG', 'WEBP', 'HEIF'}

NOT_A_PHOTO = "That isn't a photo Tastebook can use. Choose a JPEG, PNG, WebP or HEIC."


class PhotoRefusedError(Exception):
    """The file isn't a photo Tastebook takes; the message says why, for the person who chose it."""


class PhotoStoreUnavailableError(Exception):
    """The store has no token here, or didn't answer."""


def store_photo(file: IO[bytes], size: int) -> Photo:
    """Stores the photo at each of its widths as WebP, turned the way its camera held it and with none of its
    metadata (a phone's photo can carry where it was taken). Raises PhotoRefusedError or PhotoStoreUnavailableError."""
    token = settings.BLOB_READ_WRITE_TOKEN
    if photo_store() == '':
        raise PhotoStoreUnavailableError
    if size > MAX_PHOTO_BYTES:
        raise PhotoRefusedError(f'That photo is {size / 1024 / 1024:.0f} MB. Choose one under 10 MB.')
    image = _open(file)
    folder = f'recipes/{settings.PHOTO_ENVIRONMENT}/{secrets.token_urlsafe(16)}'
    urls = [_put(token, f'{folder}/{width}.webp', _encode(image, width)) for width in UPLOADED_WIDTHS]
    stored = urls[-1]
    if not is_uploaded(stored) or uploaded_addresses(stored) != urls:
        logger.error('The photo store answered addresses of another shape')
        raise PhotoStoreUnavailableError
    return Photo(stored, '', '', '')


def delete_photo(url: str) -> None:
    """Deletes an uploaded photo at every width, if this environment stored it: a preview shares production's store
    and copies its recipes, so it never deletes production's photos. A failure is logged, not raised."""
    match = UPLOADED_PHOTO.match(url)
    if match is None or not is_uploaded(url) or match['environment'] != settings.PHOTO_ENVIRONMENT:
        return
    try:
        response = requests.post(
            f'{BLOB_API}/delete',
            json={'urls': uploaded_addresses(url)},
            headers=_headers(settings.BLOB_READ_WRITE_TOKEN),
            timeout=BLOB_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
    except requests.RequestException:
        logger.warning("Couldn't delete a replaced photo from the store")


def _open(file: IO[bytes]) -> Image.Image:
    try:
        image = Image.open(file)
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError) as error:
        raise PhotoRefusedError(NOT_A_PHOTO) from error
    if image.format not in FORMATS:
        raise PhotoRefusedError(NOT_A_PHOTO)
    if image.width * image.height > MAX_PHOTO_PIXELS:
        raise PhotoRefusedError('That photo has too many pixels to use. Choose a smaller one.')
    try:
        upright = ImageOps.exif_transpose(image)
        return upright.convert('RGBA' if upright.has_transparency_data else 'RGB')
    except (OSError, ValueError) as error:
        raise PhotoRefusedError(NOT_A_PHOTO) from error


def _encode(image: Image.Image, width: int) -> bytes:
    # Each is at most its width wide, and none more than 1,600 px on its longest side.
    largest = UPLOADED_WIDTHS[-1]
    bounds = (min(width, largest), largest)
    resized = image.copy()
    resized.thumbnail(bounds, Image.Resampling.LANCZOS)
    encoded = io.BytesIO()
    resized.save(encoded, format='WEBP', quality=80, method=4)
    return encoded.getvalue()


def _headers(token: str) -> dict[str, str]:
    return {'authorization': f'Bearer {token}', 'x-api-version': BLOB_API_VERSION}


def _put(token: str, pathname: str, body: bytes) -> str:
    try:
        response = requests.put(
            f'{BLOB_API}/',
            params={'pathname': pathname},
            data=body,
            headers={
                **_headers(token),
                'x-vercel-blob-access': 'public',
                'x-content-type': 'image/webp',
                'x-add-random-suffix': '0',
                'x-allow-overwrite': '0',
                # A year: a photo's address never changes what it holds, as a new photo gets a new name.
                'x-cache-control-max-age': str(60 * 60 * 24 * 365),
            },
            timeout=BLOB_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        return response.json()['url']
    except (requests.RequestException, ValueError, KeyError, TypeError) as error:
        logger.warning("Couldn't store a photo")
        raise PhotoStoreUnavailableError from error
