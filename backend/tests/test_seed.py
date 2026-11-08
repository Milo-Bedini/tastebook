import re
from typing import Any

import pytest
from django.http import HttpResponse
from django.utils import timezone
from pytest_django.fixtures import Settings
from rest_framework.test import APIClient

from households.models import Household, User
from tests.conftest import SECRET
from tests.test_accounts import BrowserClient, signed_in_email
from tests.test_recipes import ingredient, make_recipe
from tests.test_test_accounts import stored_code

SEED = '/api/test-accounts/seed/'


def seed(body: dict[str, Any], headers: dict[str, str] | None = None) -> HttpResponse:
    return APIClient().post(SEED, body, format='json', headers=headers or {})


def seeded(*households: dict[str, Any]) -> dict[str, Any]:
    response = seed({'households': list(households)})
    assert response.status_code == 201, response.content
    return response.json()


def signed_in_as(body: dict[str, Any], key: str) -> APIClient:
    client = APIClient()
    client.cookies[body['session_cookie']] = body['accounts'][key]['session']
    return client


def a_household(*keys: str, **fields: Any) -> dict[str, Any]:
    return {'members': [{'key': key, 'name': key.title()} for key in keys], **fields}


@pytest.mark.django_db
def test_two_members_seeded_into_a_named_household_are_each_signed_in_to_it(test_accounts: Settings) -> None:
    body = seeded(a_household('ada', 'ben', name='The Lovelaces'))

    household = signed_in_as(body, 'ada').get('/api/household/').json()
    account = signed_in_as(body, 'ben').get('/api/account/').json()['account']

    assert household['name'] == 'The Lovelaces'
    assert [(member['name'], member['is_you']) for member in household['members']] == [('Ada', True), ('Ben', False)]
    assert account['name'] == 'Ben'
    assert re.fullmatch(r'ben-[0-9a-f]{8}@tastebook\.test', account['email'])
    assert body['accounts']['ben']['email'] == account['email']


@pytest.mark.django_db
def test_a_household_given_no_name_is_named_after_its_first_member_and_keeps_each_unit_system(
    test_accounts: Settings,
) -> None:
    body = seeded(
        {'members': [{'key': 'sam', 'name': 'Sam', 'unit_system': 'us'}, {'key': 'ben', 'name': 'Ben'}]},
    )

    household = signed_in_as(body, 'sam').get('/api/household/').json()
    units = [signed_in_as(body, key).get('/api/account/').json()['account']['unit_system'] for key in ('sam', 'ben')]

    assert household['name'] == "Sam's household"
    assert units == ['us', 'metric']


@pytest.mark.django_db
def test_a_seeded_recipe_has_the_described_fields_and_parts(test_accounts: Settings) -> None:
    ingredient('onion')
    curry = {
        'title': "Grandma's curry",
        'cuisines': ['Italian'],
        'prep_minutes': 20,
        'ingredient_lines': [{'amount': 2, 'ingredient': 'onion'}],
        'ingredient_groups': [{'name': 'For the sauce', 'lines': [{'ingredient': 'onion', 'note': 'sliced'}]}],
        'steps': ['Fry the onion.'],
    }
    body = seeded({'members': [{'key': 'ada', 'name': 'Ada', 'recipes': [curry]}]})
    slug = body['accounts']['ada']['recipes'][0]['slug']

    recipe = signed_in_as(body, 'ada').get(f'/api/recipes/{slug}/').json()

    assert body['accounts']['ada']['recipes'][0]['title'] == "Grandma's curry"
    assert re.fullmatch(r'grandmas-curry-[a-hjkmnp-z2-9]{6}', slug)
    assert (recipe['visibility'], recipe['prep_minutes'], recipe['cook_minutes']) == ('private', 20, None)
    assert [cuisine['name'] for cuisine in recipe['cuisines']] == ['Italian']
    assert (recipe['ingredient_lines'][0]['amount'], recipe['ingredient_lines'][0]['ingredient']['name']) == (
        2,
        'onion',
    )
    assert recipe['ingredient_groups'][0]['name'] == 'For the sauce'
    assert [step['text'] for step in recipe['steps']] == ['Fry the onion.']


@pytest.mark.django_db
def test_a_recipe_given_only_a_title_has_no_ingredients_or_method(test_accounts: Settings) -> None:
    body = seeded({'members': [{'key': 'ada', 'name': 'Ada', 'recipes': [{'title': 'Toast'}]}]})
    slug = body['accounts']['ada']['recipes'][0]['slug']

    recipe = signed_in_as(body, 'ada').get(f'/api/recipes/{slug}/').json()

    assert (recipe['title'], recipe['ingredient_lines'], recipe['ingredient_groups'], recipe['steps']) == (
        'Toast',
        [],
        [],
        [],
    )


@pytest.mark.django_db
def test_a_seeded_member_adds_an_ingredient_awaiting_review_their_recipe_can_use(test_accounts: Settings) -> None:
    ingredient('onion')
    beans = {'title': 'Chipotle beans', 'ingredient_lines': [{'ingredient': 'onion'}, {'ingredient': 'chipotle paste'}]}
    body = seeded(
        {'members': [{'key': 'ada', 'name': 'Ada', 'added_ingredients': ['chipotle paste'], 'recipes': [beans]}]}
    )
    slug = body['accounts']['ada']['recipes'][0]['slug']

    recipe = signed_in_as(body, 'ada').get(f'/api/recipes/{slug}/').json()

    assert [
        (row['ingredient']['name'], row['ingredient']['awaiting_review']) for row in recipe['ingredient_lines']
    ] == [
        ('onion', False),
        ('chipotle paste', True),
    ]
    assert recipe['diet_tags'] == []


@pytest.mark.django_db
def test_another_household_does_not_see_a_seeded_recipe(test_accounts: Settings) -> None:
    body = seeded(
        {'members': [{'key': 'ada', 'name': 'Ada', 'recipes': [{'title': 'Toast'}]}]},
        a_household('cy'),
    )
    path = f'/api/recipes/{body["accounts"]["ada"]["recipes"][0]["slug"]}/'

    statuses = [signed_in_as(body, key).get(path).status_code for key in ('ada', 'cy')]

    assert statuses == [200, 404]


@pytest.mark.django_db
def test_a_seeded_account_can_sign_in_by_code_later(test_accounts: Settings) -> None:
    email = seeded(a_household('sam'))['accounts']['sam']['email']
    browser = BrowserClient()

    browser.post('code/request', {'email': email})
    browser.post('code/confirm', {'code': stored_code(email)})

    assert signed_in_email(browser) == email


@pytest.mark.django_db
def test_a_preview_seeds_with_the_bypass_secret(test_accounts: Settings) -> None:
    test_accounts.TEST_ACCOUNT_CODES_NEED_SECRET = True

    response = seed({'households': [a_household('sam')]}, {'X-Test-Account-Secret': SECRET})

    assert response.status_code == 201
    assert list(response.json()['accounts']) == ['sam']


@pytest.mark.django_db
@pytest.mark.parametrize(
    ('overrides', 'header'),
    [
        ({'TEST_ACCOUNTS_ENABLED': False}, None),
        ({'TEST_ACCOUNT_CODES_NEED_SECRET': True}, None),
        ({'TEST_ACCOUNT_CODES_NEED_SECRET': True}, 'wrong-secret'),
        ({'TEST_ACCOUNT_CODES_NEED_SECRET': True, 'TEST_ACCOUNT_SECRET': ''}, ''),
    ],
    ids=['production', 'preview-without-secret', 'preview-with-wrong-secret', 'preview-with-no-secret-set'],
)
def test_the_seed_is_not_found_unless_test_accounts_may_be_used(
    test_accounts: Settings, overrides: dict[str, object], header: str | None
) -> None:
    for name, value in overrides.items():
        setattr(test_accounts, name, value)
    headers = None if header is None else {'X-Test-Account-Secret': header}

    response = seed({'households': [a_household('sam')]}, headers)

    assert (response.status_code, response.json()) == (404, {'detail': 'Not found.'})
    assert User.objects.count() == 0


def with_recipe(**recipe: Any) -> list[dict[str, Any]]:
    return [a_household('ada'), {'members': [{'key': 'sam', 'name': 'Sam', 'recipes': [recipe]}]}]


@pytest.mark.django_db
@pytest.mark.parametrize(
    ('households', 'refusal'),
    [
        (
            [a_household('sam'), a_household('sam')],
            {'households': ['Each member needs a key of its own; these repeat: sam']},
        ),
        (with_recipe(title='Curry', colour='red'), ['Recipe "Curry" has fields the catalogue does not know: colour']),
        (
            with_recipe(title='Curry', ingredient_lines=[{'ingredient': 'unobtainium'}]),
            ['Recipe "Curry" names no known ingredient: "unobtainium"'],
        ),
        (
            with_recipe(title='Curry', ingredient_lines=['onion']),
            ['Recipe "Curry": each ingredient line must be an object, but these are not: onion'],
        ),
        (
            with_recipe(title='Curry', ingredient_groups=['For the sauce']),
            ['Recipe "Curry": each ingredient group must be an object, but these are not: For the sauce'],
        ),
        (
            with_recipe(title='Curry', ingredient_groups=[{'name': 'For the sauce', 'lines': ['onion']}]),
            ['Recipe "Curry": each ingredient line must be an object, but these are not: onion'],
        ),
        (
            with_recipe(title='Curry', servings=4, yield_amount=12, yield_unit='biscuits'),
            ['Recipe "Curry": Give servings or a yield with its unit, not both.'],
        ),
        (
            [{'members': []}],
            {'households': {'0': {'members': {'non_field_errors': ['Ensure this field has at least 1 elements.']}}}},
        ),
        (
            [a_household('Sam')],
            {'households': {'0': {'members': {'0': {'key': ['This value does not match the required pattern.']}}}}},
        ),
    ],
    ids=[
        'repeated-key',
        'unknown-field',
        'unknown-ingredient',
        'line-not-an-object',
        'group-not-an-object',
        'group-line-not-an-object',
        'servings-and-yield',
        'no-members',
        'capital-key',
    ],
)
def test_a_description_the_seed_cannot_make_saves_nothing(
    test_accounts: Settings, households: list[dict[str, Any]], refusal: object
) -> None:
    response = seed({'households': households})

    assert (response.status_code, response.json()) == (400, refusal)
    assert (User.objects.count(), Household.objects.count()) == (0, 0)


@pytest.mark.django_db
def test_a_seeded_member_saves_recipes_to_favourites_in_order(test_accounts: Settings) -> None:
    make_recipe(title='Baklava')
    sams_curry = {'title': "Sam's curry", 'visibility': 'public'}
    body = seeded(
        {'members': [{'key': 'sam', 'name': 'Sam', 'recipes': [sams_curry]}]},
        {'members': [{'key': 'jo', 'name': 'Jo', 'saves': ['Baklava', "Sam's curry"]}]},
    )

    saved = signed_in_as(body, 'jo').get('/api/lists/favourites/').json()['saved_recipes']

    assert [entry['recipe']['title'] for entry in saved] == ["Sam's curry", 'Baklava']


@pytest.mark.django_db
def test_a_seeded_member_copies_recipes_listed_after_their_own(test_accounts: Settings) -> None:
    make_recipe(title='Baklava')
    body = seeded({'members': [{'key': 'jo', 'name': 'Jo', 'recipes': [{'title': "Jo's dal"}], 'copies': ['Baklava']}]})

    recipes = body['accounts']['jo']['recipes']
    copied = signed_in_as(body, 'jo').get(f'/api/recipes/{recipes[1]["slug"]}/').json()

    assert [recipe['title'] for recipe in recipes] == ["Jo's dal", 'Baklava']
    assert (copied['visibility'], copied['adapted_from']) == (
        'private',
        {'slug': 'baklava', 'title': 'Baklava', 'author': None},
    )


@pytest.mark.django_db
def test_a_seeded_member_makes_private_a_recipe_another_member_copied(test_accounts: Settings) -> None:
    sams_curry = {'title': "Sam's curry", 'visibility': 'public'}
    body = seeded(
        {'members': [{'key': 'sam', 'name': 'Sam', 'recipes': [sams_curry], 'made_private': ["Sam's curry"]}]},
        {'members': [{'key': 'jo', 'name': 'Jo', 'copies': ["Sam's curry"]}]},
    )

    [curry] = body['accounts']['sam']['recipes']
    [jos_copy] = body['accounts']['jo']['recipes']
    copied = signed_in_as(body, 'jo').get(f'/api/recipes/{jos_copy["slug"]}/').json()

    assert APIClient().get(f'/api/recipes/{curry["slug"]}/').status_code == 404
    assert (copied['title'], copied['adapted_from'], copied['is_copy']) == ("Sam's curry", None, True)


@pytest.mark.django_db
def test_a_seeded_member_can_t_make_private_a_recipe_they_didn_t_write(test_accounts: Settings) -> None:
    sams_curry = {'title': "Sam's curry", 'visibility': 'public'}
    response = seed(
        {
            'households': [
                {'members': [{'key': 'sam', 'name': 'Sam', 'recipes': [sams_curry]}]},
                {'members': [{'key': 'jo', 'name': 'Jo', 'made_private': ["Sam's curry"]}]},
            ]
        }
    )

    assert (response.status_code, response.json()) == (
        400,
        ['Jo can\'t make "Sam\'s curry" private: they wrote no recipe with that title.'],
    )
    assert User.objects.count() == 0


@pytest.mark.django_db
def test_a_seeded_member_can_t_copy_a_recipe_they_can_t_see(test_accounts: Settings) -> None:
    response = seed(
        {
            'households': [
                {'members': [{'key': 'sam', 'name': 'Sam', 'recipes': [{'title': "Sam's curry"}]}]},
                {'members': [{'key': 'jo', 'name': 'Jo', 'copies': ["Sam's curry"]}]},
            ]
        }
    )

    assert (response.status_code, response.json()) == (
        400,
        ['Jo can\'t copy "Sam\'s curry": no recipe they can see has that title.'],
    )
    assert User.objects.count() == 0


@pytest.mark.django_db
def test_a_seeded_member_can_t_save_a_recipe_they_can_t_see(test_accounts: Settings) -> None:
    response = seed(
        {
            'households': [
                {'members': [{'key': 'sam', 'name': 'Sam', 'recipes': [{'title': "Sam's curry"}]}]},
                {'members': [{'key': 'jo', 'name': 'Jo', 'saves': ["Sam's curry"]}]},
            ]
        }
    )

    assert (response.status_code, response.json()) == (
        400,
        ['Jo can\'t save "Sam\'s curry": no recipe they can see has that title.'],
    )
    assert User.objects.count() == 0


@pytest.mark.django_db
def test_a_seeded_member_makes_lists_of_their_own_and_the_household_s(test_accounts: Settings) -> None:
    make_recipe(title='Baklava')
    make_recipe(title='Trifle')
    lists = [
        {'name': 'Puddings', 'recipes': ['Baklava', 'Trifle']},
        {'name': 'Sunday roasts', 'scope': 'household'},
    ]
    body = seeded({'members': [{'key': 'jo', 'name': 'Jo', 'lists': lists}, {'key': 'sam', 'name': 'Sam'}]})

    jo = signed_in_as(body, 'jo')
    seen_by_sam = signed_in_as(body, 'sam').get('/api/lists/').json()['lists']
    puddings = jo.get('/api/lists/puddings/').json()['saved_recipes']

    assert [entry['recipe']['title'] for entry in puddings] == ['Trifle', 'Baklava']
    assert [(found['scope'], found['name']) for found in jo.get('/api/lists/').json()['lists']] == [
        ('personal', 'Favourites'),
        ('personal', 'Puddings'),
        ('household', 'Sunday roasts'),
    ]
    assert [found['name'] for found in seen_by_sam] == ['Favourites', 'Sunday roasts']


@pytest.mark.django_db
def test_a_seeded_member_can_t_make_a_list_named_like_another(test_accounts: Settings) -> None:
    lists = [{'name': 'Puddings'}, {'name': 'puddings'}]

    response = seed({'households': [{'members': [{'key': 'jo', 'name': 'Jo', 'lists': lists}]}]})

    assert response.status_code == 400
    assert response.json() == [
        f'Jo can\'t make the list "puddings": You already have a list called Puddings. Try another name, like '
        f'puddings {timezone.localdate().year}.'
    ]
    assert User.objects.count() == 0


@pytest.mark.django_db
def test_a_seeded_member_shares_a_private_recipe_by_link(test_accounts: Settings) -> None:
    body = seeded(
        {
            'members': [
                {
                    'key': 'sam',
                    'name': 'Sam',
                    'recipes': [{'title': "Sam's curry"}, {'title': 'Flatbreads'}],
                    'shared': ["Sam's curry"],
                }
            ]
        },
    )

    curry, flatbreads = body['accounts']['sam']['recipes']
    opened = APIClient().get(f'/api/shared/{curry["share_token"]}/')

    assert (opened.status_code, opened.json()['title']) == (200, "Sam's curry")
    assert flatbreads['share_token'] is None


@pytest.mark.django_db
def test_a_seeded_member_can_t_share_a_public_recipe(test_accounts: Settings) -> None:
    sams_curry = {'title': "Sam's curry", 'visibility': 'public'}
    response = seed(
        {
            'households': [
                {'members': [{'key': 'sam', 'name': 'Sam', 'recipes': [sams_curry], 'shared': ["Sam's curry"]}]}
            ]
        }
    )

    assert (response.status_code, response.json()) == (
        400,
        ['"Sam\'s curry" is public, so it can\'t be shared by link.'],
    )
    assert User.objects.count() == 0
