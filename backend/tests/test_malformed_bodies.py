"""Every write endpoint answers a body it can't read with 400, never 500.

A route's write methods come from its view, so a new write route or method fails test_every_write_route_is_listed
until it's listed here: in TAKES_A_BODY with the address a member of the Quillfeathers sends it to, in ALLAUTHS when
allauth reads its body, or in READS_NO_JSON_BODY with the reason.
"""

from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest
from django.core.management import CommandError, call_command
from django.http import HttpResponse
from django.urls import URLPattern, URLResolver, get_resolver, resolve
from pytest_django.fixtures import Settings

from households.models import User
from recipes.models import IngredientLine, Recipe
from tests.test_accounts import BrowserClient
from tests.test_added_ingredients import line
from tests.test_catalogue import FLAPJACKS, SHAKSHUKA, catalogue, titles, write
from tests.test_editing_recipes import CURRY, RECIPES, milos_curry, public_curry
from tests.test_household_privacy import ZEBEDEE, the_quillfeathers
from tests.test_recipes import ingredient
from tests.test_seed import seed

NOT_OBJECTS = ['"x"', '42', '["x"]', '[]']
WRITES = ('post', 'put', 'patch', 'delete')
AUTH = 'api/_allauth/browser/v1/auth'
ACCOUNT = 'api/_allauth/browser/v1/account'

# Each write route that reads a JSON body, keyed by method and route as Django's resolver writes it, with the address
# a member sends it to: their own account, household, recipes and lists, and another household's public recipe.
TAKES_A_BODY: dict[str, str] = {
    'PATCH api/account/': '/api/account/',
    'POST api/account/deletion/': '/api/account/deletion/',
    'PATCH api/household/': '/api/household/',
    'POST api/test-accounts/seed/': '/api/test-accounts/seed/',
    'POST api/recipes/': '/api/recipes/',
    'PATCH api/recipes/<slug:slug>/': '/api/recipes/{recipe}/',
    'POST api/recipes/<slug:slug>/report/': '/api/recipes/{public}/report/',
    'PUT api/recipes/<slug:slug>/visibility/': '/api/recipes/{recipe}/visibility/',
    'POST api/lists/': '/api/lists/',
    'POST api/lists/favourites/saved/': '/api/lists/favourites/saved/',
    'POST api/lists/saved/restore/': '/api/lists/saved/restore/',
    'POST api/lists/recipes/<slug:slug>/': '/api/lists/recipes/{recipe}/',
    'PATCH api/lists/household/<slug:slug>/': '/api/lists/household/quillfeather-puddings/',
    'PATCH api/lists/<slug:slug>/': '/api/lists/zebedees-secrets/',
    'POST api/ingredients/': '/api/ingredients/',
}

# allauth's routes, and ours that subclass its views, read the body as allauth does and answer in its own error shape
# (an empty 400 for a body that isn't an object), so only their status is checked.
ALLAUTHS: dict[str, str] = {
    f'POST {AUTH}/code/request': f'/{AUTH}/code/request',
    f'POST {AUTH}/code/confirm': f'/{AUTH}/code/confirm',
    f'POST {AUTH}/code/resend': f'/{AUTH}/code/resend',
    f'POST {AUTH}/signup': f'/{AUTH}/signup',
    f'POST {AUTH}/email/verify': f'/{AUTH}/email/verify',
    f'POST {AUTH}/email/verify/resend': f'/{AUTH}/email/verify/resend',
    f'DELETE {AUTH}/session': f'/{AUTH}/session',
    f'POST {AUTH}/reauthenticate': f'/{AUTH}/reauthenticate',
    f'POST {AUTH}/password/request': f'/{AUTH}/password/request',
    f'POST {AUTH}/password/reset': f'/{AUTH}/password/reset',
    f'POST {AUTH}/login': f'/{AUTH}/login',
    f'POST {AUTH}/phone/verify': f'/{AUTH}/phone/verify',
    f'POST {AUTH}/phone/verify/resend': f'/{AUTH}/phone/verify/resend',
    f'POST {AUTH}/provider/signup': f'/{AUTH}/provider/signup',
    f'POST {AUTH}/provider/redirect': f'/{AUTH}/provider/redirect',
    f'POST {AUTH}/provider/token': f'/{AUTH}/provider/token',
    f'POST {AUTH}/2fa/authenticate': f'/{AUTH}/2fa/authenticate',
    f'POST {AUTH}/2fa/reauthenticate': f'/{AUTH}/2fa/reauthenticate',
    f'POST {ACCOUNT}/password/change': f'/{ACCOUNT}/password/change',
    f'POST {ACCOUNT}/email': f'/{ACCOUNT}/email',
    f'PUT {ACCOUNT}/email': f'/{ACCOUNT}/email',
    f'PATCH {ACCOUNT}/email': f'/{ACCOUNT}/email',
    f'DELETE {ACCOUNT}/email': f'/{ACCOUNT}/email',
    f'POST {ACCOUNT}/phone': f'/{ACCOUNT}/phone',
    f'DELETE {ACCOUNT}/providers': f'/{ACCOUNT}/providers',
    f'POST {ACCOUNT}/authenticators/totp': f'/{ACCOUNT}/authenticators/totp',
    f'DELETE {ACCOUNT}/authenticators/totp': f'/{ACCOUNT}/authenticators/totp',
    f'POST {ACCOUNT}/authenticators/recovery-codes': f'/{ACCOUNT}/authenticators/recovery-codes',
    'POST api/accounts/google/login/token/': '/api/accounts/google/login/token/',
}

READS_NO_JSON_BODY: dict[str, str] = {
    'admin/*': "Django's admin: HTML forms behind staff sign-in and both factors, not a JSON API",
    'ANY api/accounts/google/login/': "allauth's redirect to Google, a function view that answers GET",
    'ANY api/accounts/google/login/callback/': "allauth's return from Google, a function view that answers GET",
    'POST api/account/deletion/code/': "sends a code to the account's own address",
    'POST api/household/invite/': "makes the household's invite link",
    'DELETE api/household/invite/': "cancels the household's invite link",
    'POST api/household/leave/': 'the member leaves for a household of their own',
    'DELETE api/household/members/<int:member_id>/': 'the member is in the path',
    'POST api/invites/<str:token>/join/': 'the invite is in the path',
    'DELETE api/recipes/<slug:slug>/': 'the recipe is in the path',
    'POST api/recipes/<slug:slug>/copy/': 'the recipe is in the path',
    'PUT api/recipes/<slug:slug>/share-link/': 'turns on the share link of the recipe in the path',
    'DELETE api/recipes/<slug:slug>/share-link/': 'turns off the share link of the recipe in the path',
    'DELETE api/lists/saved/<int:saved_id>/': 'the saved recipe is in the path',
    'DELETE api/lists/household/<slug:slug>/': 'the list is in the path',
    'DELETE api/lists/<slug:slug>/': 'the list is in the path',
    'POST api/photos/': 'takes the photo as a multipart upload; a JSON body is refused with 415 before it is read',
}


def write_routes(patterns: list[URLPattern | URLResolver], prefix: str = '') -> list[str]:
    """`<METHOD> <route>` for each write method of each route's view, in the resolver's order; `ANY <route>` for a
    function view, whose methods can't be read; `admin/*` for the admin."""
    found: list[str] = []
    for pattern in patterns:
        route = prefix + str(pattern.pattern)
        if isinstance(pattern, URLResolver):
            found += ['admin/*'] if route == 'admin/' else write_routes(pattern.url_patterns, route)
        elif view := getattr(pattern.callback, 'view_class', None):
            found += [f'{method.upper()} {route}' for method in WRITES if hasattr(view, method)]
        else:
            found.append(f'ANY {route}')
    return found


def test_every_write_route_is_listed() -> None:
    listed = [*TAKES_A_BODY, *ALLAUTHS, *READS_NO_JSON_BODY]
    # The resolver answers a route with its first view, so ours shadow allauth's at the same address.
    assert sorted(listed) == sorted(set(write_routes(get_resolver().url_patterns))), (
        'List each new write route in TAKES_A_BODY, ALLAUTHS or READS_NO_JSON_BODY'
    )
    assert len(listed) == len(set(listed))
    assert [
        f'{key} is sent to {path}'
        for key, path in {**TAKES_A_BODY, **ALLAUTHS}.items()
        if resolve(path.format(recipe='a-recipe', public='a-public-recipe')).route != key.split(' ', 1)[1]
    ] == []


def send(path: str, method: str, body: str) -> HttpResponse:
    """Sends `body` as raw JSON as Zebedee, a member of the Quillfeathers, to `path` with their own slugs filled in."""
    _, public = public_curry()
    quillfeathers = the_quillfeathers()
    zebedee = BrowserClient()
    zebedee.client.force_login(User.objects.get(email=ZEBEDEE))
    # A server error is answered as a browser gets it, so its status is checked like any other.
    zebedee.client.raise_request_exception = False
    return zebedee.client.generic(
        method,
        path.format(recipe=quillfeathers.recipe, public=public),
        body,
        content_type='application/json',
        **zebedee.csrf_header(),
    )


@pytest.fixture
def every_route(test_accounts: Settings) -> Settings:
    """Each route set up as on production: test accounts on, as previews have them, and Google's client set."""
    test_accounts.SOCIALACCOUNT_PROVIDERS = {
        'google': {'APPS': [{'client_id': 'tastebook.apps.googleusercontent.com', 'secret': 'test-only'}]}
    }
    return test_accounts


@pytest.mark.django_db
@pytest.mark.usefixtures('every_route')
@pytest.mark.parametrize('body', NOT_OBJECTS)
@pytest.mark.parametrize(('key', 'path'), TAKES_A_BODY.items(), ids=list(TAKES_A_BODY))
def test_a_body_that_isnt_a_json_object_is_refused_with_400(key: str, path: str, body: str) -> None:
    response = send(path, key.split(' ', 1)[0], body)

    assert response.status_code == 400, response.content
    assert list(response.json()) == ['non_field_errors']


@pytest.mark.django_db
@pytest.mark.usefixtures('every_route')
@pytest.mark.parametrize('body', NOT_OBJECTS)
@pytest.mark.parametrize(('key', 'path'), ALLAUTHS.items(), ids=list(ALLAUTHS))
def test_allauths_routes_answer_a_body_that_isnt_a_json_object_below_500(key: str, path: str, body: str) -> None:
    response = send(path, key.split(' ', 1)[0], body)

    assert response.status_code < 500


LINE_FIELDS = ['amount', 'amount_max', 'unit', 'ingredient', 'note', 'optional', 'original_text']
REQUIRED = ['This field is required.']


def without(item: dict[str, Any], field: str) -> dict[str, Any]:
    return {key: value for key, value in item.items() if key != field}


def adding(body: dict[str, Any]) -> HttpResponse:
    milo, _ = milos_curry()
    return milo.client.post(RECIPES, {'title': 'Dal', **body}, format='json', **milo.csrf_header())


def editing(body: dict[str, Any]) -> HttpResponse:
    milo, slug = milos_curry(ingredient_lines=[line('onion')])
    return milo.client.patch(f'{RECIPES}{slug}/', body, format='json', **milo.csrf_header())


SENDERS = [pytest.param(adding, id='adding'), pytest.param(editing, id='editing')]


def missing_fields() -> list[Any]:
    onion = line('onion')
    return [
        *(
            pytest.param(
                {'ingredient_lines': [without(onion, field)]},
                {'ingredient_lines': {'0': {field: REQUIRED}}},
                id=f'line without {field}',
            )
            for field in LINE_FIELDS
        ),
        *(
            pytest.param(
                {'ingredient_groups': [{'name': 'For the sauce', 'lines': [without(onion, field)]}]},
                {'ingredient_groups': {'0': {'lines': {'0': {field: REQUIRED}}}}},
                id=f'group line without {field}',
            )
            for field in LINE_FIELDS
        ),
        *(
            pytest.param(
                {'ingredient_groups': [without({'name': 'For the sauce', 'lines': [onion]}, field)]},
                {'ingredient_groups': {'0': {field: REQUIRED}}},
                id=f'group without {field}',
            )
            for field in ['name', 'lines']
        ),
    ]


@pytest.mark.django_db
@pytest.mark.parametrize('sender', SENDERS)
@pytest.mark.parametrize(('body', 'errors'), missing_fields())
def test_a_recipe_line_or_group_missing_a_field_is_refused(
    sender: Callable[[dict[str, Any]], HttpResponse], body: dict[str, Any], errors: dict[str, Any]
) -> None:
    ingredient('onion')

    response = sender(body)

    assert (response.status_code, response.json()) == (400, errors)
    assert (sorted(Recipe.objects.values_list('title', flat=True)), IngredientLine.objects.count()) == (
        [CURRY],
        1 if sender is editing else 0,
    )


NOT_A_DICT = 'Invalid data. Expected a dictionary, but got {}.'
NOT_A_LIST = 'Expected a list of items but got type "{}".'


@pytest.mark.django_db
@pytest.mark.parametrize('sender', SENDERS)
@pytest.mark.parametrize(
    ('body', 'errors'),
    [
        *(
            pytest.param(
                {name: [item]},
                {name: {'0': {'non_field_errors': [NOT_A_DICT.format(kind)]}}},
                id=f'{name} holding {kind}',
            )
            for name in ['ingredient_lines', 'ingredient_groups']
            for item, kind in [('onion', 'str'), (42, 'int'), ([], 'list')]
        ),
        *(
            pytest.param(
                {'ingredient_groups': [{'name': 'For the sauce', 'lines': [item]}]},
                {'ingredient_groups': {'0': {'lines': {'0': {'non_field_errors': [NOT_A_DICT.format(kind)]}}}}},
                id=f'group lines holding {kind}',
            )
            for item, kind in [('onion', 'str'), (42, 'int'), ([], 'list')]
        ),
        *(
            pytest.param(
                {name: value},
                {name: {'non_field_errors': [NOT_A_LIST.format(kind)]}},
                id=f'{name} as {kind}',
            )
            for name in ['ingredient_lines', 'ingredient_groups']
            for value, kind in [('onion', 'str'), (42, 'int'), ({}, 'dict')]
        ),
        *(
            pytest.param({'steps': [item]}, {'steps': {'0': ['Not a valid string.']}}, id=f'steps holding {kind}')
            for item, kind in [({}, 'dict'), ([], 'list')]
        ),
        pytest.param({'steps': 'Fry the onion.'}, {'steps': ['Expected a list of items but got type "str".']}),
    ],
)
def test_a_recipe_list_holding_something_else_is_refused(
    sender: Callable[[dict[str, Any]], HttpResponse], body: dict[str, Any], errors: dict[str, Any]
) -> None:
    ingredient('onion')

    response = sender(body)

    assert (response.status_code, response.json()) == (400, errors)
    assert sorted(Recipe.objects.values_list('title', flat=True)) == [CURRY]


# What a recipe record in the catalogue file or the seed may hold in place of each of its lists.
UNSHAPED_RECORDS = [
    pytest.param(field, value, id=f'{field} as {value!r}')
    for field, values in [
        ('ingredient_lines', [42, 'x', {'ingredient': 'porridge oats'}, [None], [[]], ['x']]),
        ('ingredient_groups', [42, {'name': 'For the sauce'}, ['x'], [{'name': 'Base', 'lines': 42}]]),
        ('steps', [42, [{}], [[]], [None]]),
        ('cuisines', [42, 'British', [{}], [[]]]),
        ('courses', [42, [{}]]),
        ('equipment', [42, [{}]]),
    ]
    for value in values
]


@pytest.mark.django_db
def test_the_recipe_the_unshaped_records_start_from_loads_and_seeds(tmp_path: Path, test_accounts: Settings) -> None:
    ingredient('porridge oats')

    call_command('load_catalogue', write(tmp_path / 'catalogue.json', catalogue(FLAPJACKS)))
    member = {'key': 'sam', 'name': 'Sam', 'recipes': [without(FLAPJACKS, 'slug')]}
    response = seed({'households': [{'members': [member]}]})

    assert titles() == ['Flapjacks']
    assert [recipe['title'] for recipe in response.json()['accounts']['sam']['recipes']] == ['Flapjacks']


@pytest.mark.django_db
@pytest.mark.parametrize(('field', 'value'), UNSHAPED_RECORDS)
def test_a_catalogue_recipe_holding_something_else_fails_naming_it(tmp_path: Path, field: str, value: Any) -> None:
    call_command('load_catalogue', write(tmp_path / 'first.json', catalogue(SHAKSHUKA)))

    with pytest.raises(CommandError) as error:
        call_command('load_catalogue', write(tmp_path / 'second.json', catalogue({**FLAPJACKS, field: value})))

    assert str(error.value).startswith('Recipe flapjacks')
    assert titles() == ['Shakshuka']


@pytest.mark.django_db
@pytest.mark.parametrize(('field', 'value'), UNSHAPED_RECORDS)
def test_a_seeded_recipe_holding_something_else_is_refused_naming_it(
    test_accounts: Settings, field: str, value: Any
) -> None:
    ingredient('porridge oats')
    member = {'key': 'sam', 'name': 'Sam', 'recipes': [{**without(FLAPJACKS, 'slug'), field: value}]}

    response = seed({'households': [{'members': [member]}]})

    assert response.status_code == 400
    assert response.json()[0].startswith('Recipe "Flapjacks"')
    assert User.objects.count() == 0


@pytest.mark.django_db
@pytest.mark.parametrize(
    ('contents', 'message'),
    [
        (
            {'ingredients': [], 'equipment': [], 'recipes': 42},
            '{path} must hold exactly these lists: equipment, ingredients, recipes',
        ),
        (
            {'ingredients': {}, 'equipment': [], 'recipes': []},
            '{path} must hold exactly these lists: equipment, ingredients, recipes',
        ),
        (
            {'ingredients': [], 'equipment': [], 'recipes': ['flapjacks']},
            '{path}: each recipe must be an object, but these are not: flapjacks',
        ),
    ],
)
def test_a_catalogue_file_whose_lists_hold_something_else_fails_naming_it(
    tmp_path: Path, contents: dict[str, Any], message: str
) -> None:
    path = write(tmp_path / 'catalogue.json', contents)

    with pytest.raises(CommandError) as error:
        call_command('load_catalogue', path)

    assert str(error.value) == message.format(path=path)
