import io
import json
import re
from collections.abc import Callable, Iterator
from typing import Any
from urllib.parse import parse_qs, urlsplit

import pytest
import responses
from django.core.files.uploadedfile import SimpleUploadedFile
from django.http import HttpResponse
from PIL import Image
from pytest_django.fixtures import DjangoCaptureOnCommitCallbacks, Settings

from recipes.models import Recipe
from tests.test_accounts import BrowserClient, sign_up
from tests.test_editing_recipes import CURRY, MILO, add, change, milos_curry
from tests.test_household import signed_up

PHOTOS = '/api/photos/'
STORE = 'https://teststore7.public.blob.vercel-storage.com'
PUT = re.compile(r'^https://vercel\.com/api/blob/\?')
DELETE = 'https://vercel.com/api/blob/delete'
NAME = 'AbCdEfGhIjKlMnOpQrStUv'


def uploaded(environment: str = 'preview', name: str = NAME) -> str:
    return f'{STORE}/recipes/{environment}/{name}/1600.webp'


def every_width(url: str) -> list[str]:
    return [url.replace('/1600.webp', f'/{width}.webp') for width in [330, 500, 960, 1280, 1600]]


@pytest.fixture
def blob(settings: Settings) -> Iterator[responses.RequestsMock]:
    """The Blob store's API, answering each upload with the address the store gives it."""
    settings.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_TestStore7_secretPart'
    settings.PHOTO_ENVIRONMENT = 'preview'

    def put(request: Any) -> tuple[int, dict[str, str], str]:
        pathname = parse_qs(urlsplit(request.url).query)['pathname'][0]
        return 200, {}, json.dumps({'url': f'{STORE}/{pathname}', 'pathname': pathname})

    with responses.RequestsMock(assert_all_requests_are_fired=False) as mock:
        mock.add_callback(responses.PUT, PUT, callback=put)
        mock.add(responses.POST, DELETE, json={})
        yield mock


def photo_file(
    size: tuple[int, int] = (2000, 1500), image_format: str = 'JPEG', name: str = 'curry.jpg', **save: Any
) -> SimpleUploadedFile:
    content = io.BytesIO()
    Image.new('RGB', size, 'orange').save(content, format=image_format, **save)
    return SimpleUploadedFile(name, content.getvalue(), content_type=f'image/{image_format.lower()}')


def upload(browser: BrowserClient, file: SimpleUploadedFile) -> HttpResponse:
    return browser.client.post(PHOTOS, {'photo': file}, format='multipart', **browser.csrf_header())


def stored(blob: responses.RequestsMock) -> dict[str, Image.Image]:
    """Each photo the store was sent, by its pathname."""
    return {
        parse_qs(urlsplit(call.request.url).query)['pathname'][0]: Image.open(io.BytesIO(call.request.body))
        for call in blob.calls
        if call.request.method == 'PUT'
    }


def deleted(blob: responses.RequestsMock) -> list[list[str]]:
    return [json.loads(call.request.body)['urls'] for call in blob.calls if call.request.url == DELETE]


@pytest.mark.django_db
@pytest.mark.parametrize(
    ('image_format', 'name'),
    [('JPEG', 'curry.jpg'), ('PNG', 'curry.png'), ('WEBP', 'curry.webp'), ('HEIF', 'curry.heic')],
)
def test_stores_a_photo_at_each_width_as_webp_and_gives_its_address(
    blob: responses.RequestsMock, image_format: str, name: str
) -> None:
    milo = signed_up(MILO, 'Milo')

    response = upload(milo, photo_file((2000, 1500), image_format=image_format, name=name))

    body = response.json()
    assert response.status_code == 201
    folder = re.fullmatch(rf'{STORE}/recipes/preview/([A-Za-z0-9_-]{{22}})/1600\.webp', body['url'])
    assert folder is not None
    assert body == {
        'url': body['url'],
        'thumbnails': [
            {'width': width, 'url': url}
            for width, url in zip([330, 500, 960, 1280, 1600], every_width(body['url']), strict=True)
        ],
        'credit': None,
    }
    sent = stored(blob)
    assert {pathname: (image.format, image.size) for pathname, image in sent.items()} == {
        f'recipes/preview/{folder[1]}/330.webp': ('WEBP', (330, 248)),
        f'recipes/preview/{folder[1]}/500.webp': ('WEBP', (500, 375)),
        f'recipes/preview/{folder[1]}/960.webp': ('WEBP', (960, 720)),
        f'recipes/preview/{folder[1]}/1280.webp': ('WEBP', (1280, 960)),
        f'recipes/preview/{folder[1]}/1600.webp': ('WEBP', (1600, 1200)),
    }
    headers = blob.calls[0].request.headers
    assert (headers['authorization'], headers['x-vercel-blob-access'], headers['x-add-random-suffix']) == (
        'Bearer vercel_blob_rw_TestStore7_secretPart',
        'public',
        '0',
    )


@pytest.mark.django_db
def test_turns_a_photo_the_way_its_camera_held_it_and_drops_its_metadata(blob: responses.RequestsMock) -> None:
    milo = signed_up(MILO, 'Milo')
    exif = Image.Exif()
    # Rotated 90 degrees, as a phone held upright saves it, and where it was taken.
    exif[0x0112] = 6
    exif[0x8825] = {2: (51.0, 30.0, 0.0)}

    response = upload(milo, photo_file((1200, 900), exif=exif))

    assert response.status_code == 201
    largest = stored(blob)[response.json()['url'].removeprefix(f'{STORE}/')]
    assert largest.size == (900, 1200)
    assert (largest.getexif(), largest.info.get('exif')) == ({}, None)


@pytest.mark.django_db
def test_never_makes_a_small_photo_bigger(blob: responses.RequestsMock) -> None:
    milo = signed_up(MILO, 'Milo')

    response = upload(milo, photo_file((400, 300), image_format='PNG', name='curry.png'))

    assert response.status_code == 201
    assert sorted(image.size for image in stored(blob).values()) == [
        (330, 248),
        (400, 300),
        (400, 300),
        (400, 300),
        (400, 300),
    ]


def pdf() -> SimpleUploadedFile:
    return SimpleUploadedFile('menu.pdf', b'%PDF-1.7 not a photo', content_type='application/pdf')


def gif() -> SimpleUploadedFile:
    return photo_file(image_format='GIF', name='curry.gif')


def over_10_mb() -> SimpleUploadedFile:
    return SimpleUploadedFile('curry.jpg', b'\xff' * (14 * 1024 * 1024), content_type='image/jpeg')


def empty() -> SimpleUploadedFile:
    return SimpleUploadedFile('curry.jpg', b'', content_type='image/jpeg')


@pytest.mark.django_db
@pytest.mark.parametrize(
    ('file', 'message'),
    [
        pytest.param(pdf, "That isn't a photo Tastebook can use. Choose a JPEG, PNG, WebP or HEIC.", id='a PDF'),
        pytest.param(gif, "That isn't a photo Tastebook can use. Choose a JPEG, PNG, WebP or HEIC.", id='a GIF'),
        pytest.param(over_10_mb, 'That photo is 14 MB. Choose one under 10 MB.', id='over 10 MB'),
        pytest.param(empty, 'Choose a photo.', id='an empty file'),
    ],
)
def test_refuses_a_file_that_is_not_a_photo_it_takes(
    blob: responses.RequestsMock, file: Callable[[], SimpleUploadedFile], message: str
) -> None:
    milo = signed_up(MILO, 'Milo')

    response = upload(milo, file())

    assert (response.status_code, response.json()) == (400, {'photo': [message]})
    assert stored(blob) == {}


@pytest.mark.django_db
def test_refuses_an_upload_with_no_photo(blob: responses.RequestsMock) -> None:
    milo = signed_up(MILO, 'Milo')

    response = milo.client.post(PHOTOS, {}, format='multipart', **milo.csrf_header())

    assert (response.status_code, response.json()) == (400, {'photo': ['Choose a photo.']})


def signed_out() -> BrowserClient:
    return BrowserClient()


def with_no_household_yet() -> BrowserClient:
    browser = BrowserClient()
    sign_up(browser, 'ben@example.com')
    return browser


@pytest.mark.django_db
@pytest.mark.parametrize('who', [signed_out, with_no_household_yet])
def test_only_a_household_member_uploads_a_photo(
    blob: responses.RequestsMock, who: Callable[[], BrowserClient]
) -> None:
    response = upload(who(), photo_file())

    assert response.status_code == 403
    assert stored(blob) == {}


@pytest.mark.django_db
def test_answers_503_without_the_stores_token(settings: Settings) -> None:
    settings.BLOB_READ_WRITE_TOKEN = ''
    milo = signed_up(MILO, 'Milo')

    response = upload(milo, photo_file())

    assert (response.status_code, response.json()) == (503, {'detail': "Couldn't store the photo. Try again."})


@pytest.mark.django_db
def test_answers_503_when_the_store_fails(blob: responses.RequestsMock) -> None:
    blob.replace(responses.PUT, PUT, status=500)
    milo = signed_up(MILO, 'Milo')

    response = upload(milo, photo_file())

    assert response.status_code == 503


@pytest.mark.django_db
def test_a_recipe_keeps_an_uploaded_photo_with_no_credit(blob: responses.RequestsMock) -> None:
    milo = signed_up(MILO, 'Milo')
    photo = upload(milo, photo_file()).json()

    slug = add(milo, {'title': CURRY, 'photo_url': photo['url']})

    assert milo.client.get(f'/api/recipes/{slug}/').json()['photo'] == photo
    assert [recipe['photo'] for recipe in milo.client.get('/api/recipes/').json() if recipe['slug'] == slug] == [photo]


@pytest.mark.django_db
@pytest.mark.parametrize(
    'address',
    [
        pytest.param('https://example.com/curry.jpg', id='another site'),
        pytest.param(
            f'https://otherstore.public.blob.vercel-storage.com/recipes/preview/{NAME}/1600.webp', id='another store'
        ),
        pytest.param(f'{STORE}/recipes/preview/{NAME}/330.webp', id='a smaller width'),
        pytest.param(f'{STORE}/backups/{NAME}/1600.webp', id='outside recipes'),
    ],
)
def test_refuses_a_photo_address_tastebook_did_not_store(blob: responses.RequestsMock, address: str) -> None:
    milo = signed_up(MILO, 'Milo')

    response = milo.client.post(
        '/api/recipes/', {'title': CURRY, 'photo_url': address}, format='json', **milo.csrf_header()
    )

    assert (response.status_code, response.json()) == (
        400,
        {
            'photo_url': [
                'Give the address of a JPEG, PNG or WebP file on Wikimedia Commons, starting '
                'https://upload.wikimedia.org/wikipedia/commons/, or of a photo uploaded to Tastebook.'
            ]
        },
    )


@pytest.mark.django_db
@pytest.mark.parametrize(
    ('new_photo', 'expected'),
    [
        pytest.param(uploaded(name='ZyXwVuTsRqPoNmLkJiHgFe'), uploaded(name='ZyXwVuTsRqPoNmLkJiHgFe'), id='replaced'),
        pytest.param('', None, id='removed'),
    ],
)
def test_a_replaced_or_removed_photo_is_deleted_from_the_store_once_saved(
    blob: responses.RequestsMock,
    django_capture_on_commit_callbacks: DjangoCaptureOnCommitCallbacks,
    new_photo: str,
    expected: str | None,
) -> None:
    milo, slug = milos_curry(photo_url=uploaded())

    with django_capture_on_commit_callbacks(execute=True):
        response = change(milo, slug, {'photo_url': new_photo})

    assert response.status_code == 200
    assert (response.json()['photo'] or {}).get('url') == expected
    assert deleted(blob) == [every_width(uploaded())]


@pytest.mark.django_db
def test_keeps_the_photo_in_the_store_when_the_recipe_keeps_it(
    blob: responses.RequestsMock, django_capture_on_commit_callbacks: DjangoCaptureOnCommitCallbacks
) -> None:
    milo, slug = milos_curry(photo_url=uploaded())

    with django_capture_on_commit_callbacks(execute=True):
        response = change(milo, slug, {'title': 'Lamb curry', 'photo_url': uploaded()})

    assert response.json()['photo']['url'] == uploaded()
    assert deleted(blob) == []


@pytest.mark.django_db
def test_a_preview_never_deletes_a_photo_another_environment_stored(
    blob: responses.RequestsMock, django_capture_on_commit_callbacks: DjangoCaptureOnCommitCallbacks
) -> None:
    production_photo = uploaded(environment='production')
    milo, slug = milos_curry(photo_url=production_photo)

    with django_capture_on_commit_callbacks(execute=True):
        response = change(milo, slug, {'photo_url': ''})

    assert (response.status_code, response.json()['photo']) == (200, None)
    assert deleted(blob) == []


@pytest.mark.django_db
def test_deleting_a_recipe_deletes_its_photo_from_the_store(
    blob: responses.RequestsMock, django_capture_on_commit_callbacks: DjangoCaptureOnCommitCallbacks
) -> None:
    milo, slug = milos_curry(photo_url=uploaded())

    with django_capture_on_commit_callbacks(execute=True):
        response = milo.client.delete(f'/api/recipes/{slug}/', **milo.csrf_header())

    assert response.status_code == 204
    assert deleted(blob) == [every_width(uploaded())]


@pytest.mark.django_db
def test_a_failed_delete_still_saves_the_recipe(
    blob: responses.RequestsMock, django_capture_on_commit_callbacks: DjangoCaptureOnCommitCallbacks
) -> None:
    blob.replace(responses.POST, DELETE, status=500)
    milo, slug = milos_curry(photo_url=uploaded())

    with django_capture_on_commit_callbacks(execute=True):
        response = change(milo, slug, {'photo_url': ''})

    assert (response.status_code, Recipe.objects.get(slug=slug).photo_url) == (200, '')


COMMONS = {
    'photo_url': 'https://upload.wikimedia.org/wikipedia/commons/7/7e/Shakshuka_%28Tel_Aviv%29.jpg',
    'photo_author': 'Jane Doe',
    'photo_licence': 'CC BY-SA 4.0',
    'photo_source_url': 'https://commons.wikimedia.org/wiki/File:Shakshuka_(Tel_Aviv).jpg',
}


@pytest.mark.django_db
def test_an_upload_replacing_a_commons_photo_takes_its_credit_away(blob: responses.RequestsMock) -> None:
    milo, slug = milos_curry()
    Recipe.objects.filter(slug=slug).update(**COMMONS)

    response = change(milo, slug, {'photo_url': uploaded()})

    assert (response.status_code, response.json()['photo']['credit']) == (200, None)
    recipe = Recipe.objects.get(slug=slug)
    assert (recipe.photo_author, recipe.photo_licence, recipe.photo_source_url) == ('', '', '')
