import re
import time
from collections.abc import Callable
from typing import Any

import pytest
import responses
from allauth.account.models import EmailAddress
from allauth.socialaccount.models import SocialAccount
from django.contrib.auth import SESSION_KEY
from django.contrib.sessions.models import Session
from django.core import mail
from django.core.cache import cache
from django.http import HttpResponse
from pytest_django.fixtures import DjangoCaptureOnCommitCallbacks

from households.models import Household, Invite, User
from recipe_collections.models import RecipeList
from recipes.models import Recipe, Visibility
from tests import test_google_sign_in, test_recipe_photos
from tests.test_accounts import CODE_SUBJECT, BrowserClient
from tests.test_editing_recipes import BEN, MILO, ben_in_milos_household
from tests.test_google_sign_in import google_profile, sign_in_with_google
from tests.test_household import make_link, member, remove, signed_up
from tests.test_recipe_photos import deleted, every_width, uploaded
from tests.test_recipes import make_recipe
from tests.test_saving_recipes import FAVOURITES, JO, save
from tests.test_saving_to_lists import save_to

DELETION = '/api/account/deletion/'
DELETION_CODE = '/api/account/deletion/code/'
DELETION_SUBJECT = re.compile(r'Your code to delete your Tastebook account is (\d{6})')
STAFF_REFUSED = "Staff accounts can't be deleted here. Ask another staff member to take your staff access away first."
WRONG_CODE = {'code': ["That code isn't right. Check the email and try again."]}
STOPPED = {'detail': 'That code has stopped working. Send a new code.'}
SENT_AT = 1_800_000_000.0

# The Blob store's API, as the photo tests mock it.
blob = test_recipe_photos.blob
# Google's client, set up for every test here as for the Google sign-in tests.
google_client = test_google_sign_in.google_client


@pytest.fixture(autouse=True)
def no_rate_limits_carried_over() -> None:
    cache.clear()


def see(browser: BrowserClient) -> HttpResponse:
    return browser.client.get(DELETION)


def ask_for_code(browser: BrowserClient) -> HttpResponse:
    return browser.client.post(DELETION_CODE, **browser.csrf_header())


def delete(browser: BrowserClient, code: str) -> HttpResponse:
    return browser.client.post(DELETION, {'code': code}, format='json', **browser.csrf_header())


def deletion_code(to: str) -> str:
    sent = [message for message in mail.outbox if message.to == [to] and DELETION_SUBJECT.fullmatch(message.subject)]
    return DELETION_SUBJECT.fullmatch(sent[-1].subject).group(1)


def wrong(code: str) -> str:
    return '000000' if code != '000000' else '111111'


def signed_in_as(email: str) -> BrowserClient:
    """Another browser, signed in to the account."""
    browser = BrowserClient()
    browser.client.force_login(User.objects.get(email=email))
    return browser


def milos_household() -> Household:
    return User.objects.get(email=MILO).household


def written_by(email: str, title: str, visibility: Visibility = Visibility.PRIVATE, **fields: Any) -> Recipe:
    account = User.objects.get(email=email)
    return make_recipe(title=title, household=account.household, created_by=account, visibility=visibility, **fields)


def account_exists(email: str) -> bool:
    return User.objects.filter(email=email).exists()


def milo_with_ben() -> BrowserClient:
    """Milo, with Ben in his household; Milo wrote 2 private recipes and 1 public one, Ben 1 private one."""
    milo = signed_up(MILO, 'Milo')
    ben_in_milos_household()
    written_by(MILO, 'Lamb curry')
    written_by(MILO, 'Dal')
    written_by(MILO, 'Shakshuka', Visibility.PUBLIC)
    written_by(BEN, "Ben's crumble")
    return milo


def milo_alone() -> BrowserClient:
    """Milo, alone in his household with 2 private recipes and 1 public one he wrote, and 1 of each left by a member
    who has deleted their account."""
    milo = signed_up(MILO, 'Milo')
    written_by(MILO, 'Lamb curry')
    written_by(MILO, 'Dal')
    written_by(MILO, 'Shakshuka', Visibility.PUBLIC)
    make_recipe(title='Flapjacks', household=milos_household())
    make_recipe(title='Soda bread', household=milos_household(), visibility=Visibility.PUBLIC)
    return milo


def milo_with_no_name_yet() -> BrowserClient:
    browser = BrowserClient()
    browser.client.force_login(User.objects.create_user(MILO))
    return browser


@pytest.mark.django_db
@pytest.mark.parametrize(
    ('who', 'expected'),
    [
        pytest.param(milo_with_ben, (2, 1, 1), id='with others in the household'),
        pytest.param(milo_alone, (3, 2, 0), id='the last member'),
        pytest.param(milo_with_no_name_yet, (0, 0, 0), id='no household yet'),
    ],
)
def test_an_account_sees_what_deleting_it_would_delete_and_keep(
    who: Callable[[], BrowserClient], expected: tuple[int, int, int]
) -> None:
    response = see(who())

    private, public, others = expected
    assert (response.status_code, response.json()) == (
        200,
        {'private_recipes': private, 'public_recipes': public, 'others_in_household': others, 'is_staff': False},
    )


@pytest.mark.django_db
def test_asking_for_a_deletion_code_emails_one_that_works_for_10_minutes() -> None:
    milo = signed_up(MILO, 'Milo')

    response = ask_for_code(milo)

    [email] = [message for message in mail.outbox if DELETION_SUBJECT.fullmatch(message.subject)]
    code = deletion_code(MILO)
    assert (response.status_code, email.to) == (204, [MILO])
    assert code in email.body
    assert '10 minutes' in email.body


@pytest.mark.django_db
@pytest.mark.parametrize(('seconds_later', 'status'), [(599, 204), (601, 409)])
def test_a_deletion_code_works_for_10_minutes(monkeypatch: pytest.MonkeyPatch, seconds_later: int, status: int) -> None:
    milo = signed_up(MILO, 'Milo')
    monkeypatch.setattr(time, 'time', lambda: SENT_AT)
    ask_for_code(milo)
    monkeypatch.setattr(time, 'time', lambda: SENT_AT + seconds_later)

    response = delete(milo, deletion_code(MILO))

    assert (response.status_code, account_exists(MILO)) == (status, status != 204)


@pytest.mark.django_db
def test_the_5th_wrong_deletion_code_stops_the_code() -> None:
    milo = signed_up(MILO, 'Milo')
    ask_for_code(milo)
    code = deletion_code(MILO)

    tries = [delete(milo, wrong(code)) for _ in range(5)]
    right = delete(milo, code)

    assert [response.status_code for response in [*tries, right]] == [400, 400, 400, 400, 409, 409]
    assert (tries[0].json(), right.json()) == (WRONG_CODE, STOPPED)
    assert account_exists(MILO)


@pytest.mark.django_db
def test_a_deletion_code_works_once() -> None:
    milo = signed_up(MILO, 'Milo')
    ask_for_code(milo)
    code = deletion_code(MILO)

    statuses = [delete(milo, code).status_code for _ in range(2)]

    assert statuses == [204, 403]


@pytest.mark.django_db
def test_a_deletion_code_works_only_in_the_browser_that_asked_for_it() -> None:
    milo = signed_up(MILO, 'Milo')
    ask_for_code(milo)

    response = delete(signed_in_as(MILO), deletion_code(MILO))

    assert (response.status_code, response.json(), account_exists(MILO)) == (409, STOPPED, True)


@pytest.mark.django_db
def test_a_new_deletion_code_replaces_the_last() -> None:
    milo = signed_up(MILO, 'Milo')
    ask_for_code(milo)
    first = deletion_code(MILO)
    ask_for_code(milo)
    second = deletion_code(MILO)

    statuses = [delete(milo, first).status_code, delete(milo, second).status_code]

    # The first is a wrong code now, unless the two happen to match.
    assert statuses == ([400, 204] if first != second else [204, 403])


@pytest.mark.django_db
def test_deletion_codes_count_towards_sign_ins_limit_of_3_codes_in_10_minutes(monkeypatch: pytest.MonkeyPatch) -> None:
    milo = signed_up(MILO, 'Milo')
    sent_before = len(mail.outbox)

    def at(seconds: int, ask: Callable[[], HttpResponse]) -> HttpResponse:
        monkeypatch.setattr(time, 'time', lambda: SENT_AT + seconds)
        return ask()

    answers = [
        at(0, lambda: ask_for_code(milo)),
        at(60, lambda: BrowserClient().post('code/request', {'email': MILO})),
        at(120, lambda: ask_for_code(milo)),
        at(180, lambda: ask_for_code(milo)),
    ]

    codes_sent = [
        message.subject
        for message in mail.outbox[sent_before:]
        if message.to == [MILO]
        and any(subject.fullmatch(message.subject) for subject in (DELETION_SUBJECT, CODE_SUBJECT))
    ]
    assert [answer.status_code for answer in answers] == [204, 401, 204, 429]
    assert answers[-1].get('Retry-After') == '420'
    assert len(codes_sent) == 3


def deleted_with_the_right_code(milo: BrowserClient) -> HttpResponse:
    ask_for_code(milo)
    return delete(milo, deletion_code(MILO))


def milos_sessions(milo_id: int) -> list[str]:
    return [
        session.session_key
        for session in Session.objects.all()
        if session.get_decoded().get(SESSION_KEY) == str(milo_id)
    ]


@pytest.mark.django_db
def test_deleting_removes_the_account_its_lists_and_private_recipes_and_signs_it_out_everywhere() -> None:
    milo = milo_with_ben()
    elsewhere = signed_in_as(MILO)
    milo_id = User.objects.get(email=MILO).pk
    save(milo, Recipe.objects.get(title="Ben's crumble").slug)
    milo.client.post('/api/lists/', {'name': 'Weeknights', 'scope': 'personal'}, format='json', **milo.csrf_header())

    response = deleted_with_the_right_code(milo)

    assert response.status_code == 204
    assert (
        User.objects.filter(pk=milo_id).exists(),
        EmailAddress.objects.filter(email=MILO).exists(),
        RecipeList.objects.filter(owner_id=milo_id).exists(),
    ) == (False, False, False)
    assert sorted(Recipe.objects.values_list('title', flat=True)) == ["Ben's crumble", 'Shakshuka']
    assert milo.client.get('/api/account/').json() == {'account': None}
    assert elsewhere.client.get('/api/account/').json() == {'account': None}
    assert milos_sessions(milo_id) == []


def author_everywhere(slug: str, jo: BrowserClient, jos_copy: str) -> list[str | None]:
    stranger = BrowserClient()
    listed = {recipe['slug']: recipe['author'] for recipe in stranger.client.get('/api/recipes/').json()}
    [saved] = jo.client.get(FAVOURITES).json()['saved_recipes']
    return [
        stranger.client.get(f'/api/recipes/{slug}/').json()['author'],
        listed[slug],
        saved['recipe']['author'],
        stranger.client.get(f'/api/recipes/{jos_copy}/').json()['adapted_from']['author'],
    ]


@pytest.mark.django_db
def test_a_deleted_accounts_public_recipes_stay_credited_to_a_former_member() -> None:
    milo = milo_with_ben()
    shakshuka = Recipe.objects.get(title='Shakshuka').slug
    pie = make_recipe(title='Apple pie')
    jo = signed_up(JO, 'Jo')
    save(jo, shakshuka)
    jos_copy = jo.client.post(f'/api/recipes/{shakshuka}/copy/', **jo.csrf_header()).json()['slug']
    Recipe.objects.filter(slug=jos_copy).update(visibility=Visibility.PUBLIC)
    before = author_everywhere(shakshuka, jo, jos_copy)

    deleted_with_the_right_code(milo)

    stranger = BrowserClient()
    assert before == ['Milo', 'Milo', 'Milo', 'Milo']
    assert author_everywhere(shakshuka, jo, jos_copy) == ['a former member'] * 4
    assert stranger.client.get(f'/api/recipes/{shakshuka}/').status_code == 200
    assert stranger.client.get(f'/api/recipes/{pie.slug}/').json()['author'] is None


@pytest.mark.django_db
def test_a_household_with_others_left_carries_on() -> None:
    milo = milo_with_ben()
    household = milos_household()
    ben = signed_in_as(BEN)
    ben.client.post('/api/lists/', {'name': 'Sunday roasts', 'scope': 'household'}, format='json', **ben.csrf_header())
    save_to(ben, Recipe.objects.get(title='Dal').slug, 'household', 'sunday-roasts')

    deleted_with_the_right_code(milo)

    household.refresh_from_db()
    members = ben.client.get('/api/household/').json()['members']
    [saved] = ben.client.get('/api/lists/household/sunday-roasts/').json()['saved_recipes']
    assert household.name == "Milo's household"
    assert sorted(Recipe.objects.filter(household=household).values_list('title', 'created_by__email')) == [
        ("Ben's crumble", BEN),
        ('Shakshuka', None),
    ]
    assert [found['name'] for found in members] == ['Ben']
    assert (saved['title'], saved['recipe']) == ('Dal', None)


@pytest.mark.django_db
def test_a_last_members_household_stays_for_its_public_recipes_renamed_and_emptied() -> None:
    milo = milo_alone()
    household = milos_household()
    milo.client.post('/api/lists/', {'name': 'Bakes', 'scope': 'household'}, format='json', **milo.csrf_header())
    make_link(milo)

    deleted_with_the_right_code(milo)

    household.refresh_from_db()
    shakshuka = Recipe.objects.get(title='Shakshuka').slug
    assert household.name == 'A former household'
    assert (
        household.members.exists(),
        RecipeList.objects.filter(household=household).exists(),
        Invite.objects.filter(household=household, cancelled_at__isnull=True).exists(),
    ) == (False, False, False)
    assert sorted(Recipe.objects.filter(household=household).values_list('title', flat=True)) == [
        'Shakshuka',
        'Soda bread',
    ]
    assert BrowserClient().client.get(f'/api/recipes/{shakshuka}/').json()['author'] == 'a former member'


@pytest.mark.django_db
def test_a_last_members_household_with_no_public_recipes_is_deleted() -> None:
    milo = signed_up(MILO, 'Milo')
    household_id = milos_household().pk
    written_by(MILO, 'Dal')

    deleted_with_the_right_code(milo)

    assert (Household.objects.filter(pk=household_id).exists(), Recipe.objects.exists()) == (False, False)


@pytest.mark.django_db
@pytest.mark.parametrize(('used_elsewhere', 'deleted_photos'), [(False, [every_width(uploaded())]), (True, [])])
def test_a_deleted_private_recipes_photo_leaves_the_store_unless_another_recipe_uses_it(
    blob: responses.RequestsMock,
    django_capture_on_commit_callbacks: DjangoCaptureOnCommitCallbacks,
    used_elsewhere: bool,
    deleted_photos: list[list[str]],
) -> None:
    milo = signed_up(MILO, 'Milo')
    written_by(MILO, 'Dal', photo_url=uploaded())
    if used_elsewhere:
        signed_up(JO, 'Jo')
        written_by(JO, "Jo's dal", photo_url=uploaded())
    ask_for_code(milo)

    with django_capture_on_commit_callbacks(execute=True):
        response = delete(milo, deletion_code(MILO))

    assert (response.status_code, deleted(blob)) == (204, deleted_photos)


@pytest.mark.django_db
def test_an_account_that_signs_in_with_google_deletes_with_a_code_from_its_email() -> None:
    browser = BrowserClient()
    sign_in_with_google(browser, google_profile())

    asked = ask_for_code(browser)
    response = delete(browser, deletion_code('milo@example.com'))

    assert (asked.status_code, response.status_code) == (204, 204)
    assert (SocialAccount.objects.exists(), User.objects.exists()) == (False, False)


@pytest.mark.django_db
@pytest.mark.parametrize(
    ('send', 'status', 'body'),
    [
        pytest.param(see, 200, {'private_recipes': 0, 'public_recipes': 0, 'others_in_household': 0, 'is_staff': True}),
        pytest.param(ask_for_code, 403, {'detail': STAFF_REFUSED}),
        pytest.param(lambda browser: delete(browser, '123456'), 403, {'detail': STAFF_REFUSED}),
    ],
    ids=['see', 'ask for a code', 'delete'],
)
def test_a_staff_account_cant_delete_itself(
    send: Callable[[BrowserClient], HttpResponse], status: int, body: dict[str, Any]
) -> None:
    milo = signed_up(MILO, 'Milo')
    User.objects.filter(email=MILO).update(is_staff=True)
    sent_before = len(mail.outbox)

    response = send(milo)

    assert (response.status_code, response.json()) == (status, body)
    assert (len(mail.outbox), account_exists(MILO)) == (sent_before, True)


def signed_out(_: BrowserClient) -> BrowserClient:
    return BrowserClient()


def without_the_csrf_header(milo: BrowserClient) -> BrowserClient:
    browser = BrowserClient()
    browser.client.force_login(User.objects.get(email=MILO))
    browser.csrf_header = dict  # type: ignore[method-assign]
    return browser


@pytest.mark.django_db
@pytest.mark.parametrize(
    ('who', 'send'),
    [
        pytest.param(signed_out, see, id='signed out: see'),
        pytest.param(signed_out, ask_for_code, id='signed out: ask for a code'),
        pytest.param(signed_out, lambda browser: delete(browser, '123456'), id='signed out: delete'),
        pytest.param(without_the_csrf_header, ask_for_code, id='no CSRF header: ask for a code'),
        pytest.param(without_the_csrf_header, lambda browser: delete(browser, '123456'), id='no CSRF header: delete'),
    ],
)
def test_only_the_signed_in_browser_itself_may_see_ask_or_delete(
    who: Callable[[BrowserClient], BrowserClient], send: Callable[[BrowserClient], HttpResponse]
) -> None:
    milo = signed_up(MILO, 'Milo')
    sent_before = len(mail.outbox)

    response = send(who(milo))

    assert (response.status_code, len(mail.outbox), account_exists(MILO)) == (403, sent_before, True)


@pytest.mark.django_db
def test_an_account_removed_from_its_household_before_deleting_takes_only_its_own_household() -> None:
    milo = signed_up(MILO, 'Milo')
    ben_in_milos_household()
    written_by(MILO, 'Dal')
    written_by(BEN, "Ben's crumble")
    ben = signed_in_as(BEN)
    bens_household = milos_household()
    ask_for_code(milo)
    remove(ben, member(MILO))
    milos_new_household = milos_household()
    bens_recipes = sorted(Recipe.objects.filter(household=bens_household).values_list('title', flat=True))

    response = delete(milo, deletion_code(MILO))

    assert response.status_code == 204
    assert Household.objects.filter(pk=milos_new_household.pk).exists() is False
    assert sorted(Recipe.objects.filter(household=bens_household).values_list('title', flat=True)) == bens_recipes
    assert bens_recipes == ["Ben's crumble", 'Dal']
