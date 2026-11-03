import hmac
from http import HTTPStatus
from typing import Any

from allauth.headless.account.inputs import ConfirmLoginCodeInput, RequestLoginCodeInput, VerifyEmailInput
from allauth.headless.account.views import ConfirmLoginCodeView, RequestLoginCodeView, SignupView, VerifyEmailView
from allauth.headless.base.response import ConflictResponse, RateLimitResponse
from allauth.headless.internal.restkit.response import ErrorResponse
from django.conf import settings
from django.http import HttpRequest, HttpResponse, HttpResponseBase
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.exceptions import APIException, NotAuthenticated, NotFound
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from households.models import Household, Invite, User
from households.serializers import (
    AccountChangesSerializer,
    AccountSerializer,
    CurrentAccountSerializer,
    HouseholdChangesSerializer,
    HouseholdSerializer,
    JoinInviteSerializer,
    SignInCodeSerializer,
)
from households.services import (
    InviteNotLiveError,
    cancel_invite,
    current_invite,
    invite_seen_by,
    invite_status,
    is_test_account,
    join_household,
    latest_sign_in_code,
    leave_household,
    make_invite,
    members_of,
    remove_member,
    rename_household,
    seconds_until_allowed,
    update_account,
)


def may_read_codes(request: Request) -> bool:
    if not settings.TEST_ACCOUNTS_ENABLED:
        return False
    if not settings.TEST_ACCOUNT_CODES_NEED_SECRET:
        return True
    secret = request.headers.get('X-Test-Account-Secret', '')
    return bool(settings.TEST_ACCOUNT_SECRET) and hmac.compare_digest(secret, settings.TEST_ACCOUNT_SECRET)


class TestAccountCodeView(APIView):
    authentication_classes = []
    permission_classes = []

    @extend_schema(
        operation_id='test_account_code_retrieve',
        parameters=[OpenApiParameter('email', str, required=True)],
        responses={200: SignInCodeSerializer, 404: None},
        description='The latest sign-in code of a test account at tastebook.test. Local runs and previews only; '
        '404 on production.',
    )
    def get(self, request: Request) -> Response:
        email = request.query_params.get('email', '')
        if not may_read_codes(request) or not is_test_account(email):
            raise NotFound
        code = latest_sign_in_code(email)
        if code is None:
            raise NotFound
        return Response(SignInCodeSerializer({'code': code}).data)


# allauth's own session endpoint answers 401 to a visitor who isn't signed in, which browsers log as an error on every
# page; this one answers 200 either way. It also sets the CSRF cookie that allauth's unsafe requests send back.
@method_decorator(ensure_csrf_cookie, name='get')
class CurrentAccountView(APIView):
    @extend_schema(
        operation_id='current_account_retrieve',
        responses={200: CurrentAccountSerializer},
        description='The account signed in on this browser, or null when nobody is.',
    )
    def get(self, request: Request) -> Response:
        account = request.user if request.user.is_authenticated else None
        return Response(CurrentAccountSerializer({'account': account}).data)

    @extend_schema(
        operation_id='current_account_partial_update',
        request=AccountChangesSerializer,
        responses={200: AccountSerializer, 400: None, 403: None},
        description="Saves the signed-in account's name, unit system or both. An account with no household gets one "
        'called "<name>\'s household"; a later name leaves the household\'s name as it is.',
    )
    def patch(self, request: Request) -> Response:
        if not request.user.is_authenticated:
            raise NotAuthenticated
        changes = AccountChangesSerializer(data=request.data)
        changes.is_valid(raise_exception=True)
        account = update_account(request.user, **changes.validated_data)
        return Response(AccountSerializer(account).data)


def household_body(account: User) -> dict[str, Any]:
    invite = current_invite(account.household_id)
    return HouseholdSerializer(
        {
            'id': account.household_id,
            'name': account.household.name,
            'members': members_of(account.household_id, account),
            # The server decides the status, so a phone with the wrong clock still shows the right state.
            'invite': None
            if invite is None
            else {'token': invite.token, 'expires_at': invite.expires_at, 'status': invite_status(invite)},
        }
    ).data


def signed_in_member(request: Request) -> User:
    if not request.user.is_authenticated:
        raise NotAuthenticated
    # A nameless account has no household yet; the name page gives it one.
    if request.user.household_id is None:
        raise NotFound
    return request.user


class HouseholdView(APIView):
    @extend_schema(
        operation_id='household_retrieve',
        responses={200: HouseholdSerializer, 403: None, 404: None},
        description="The signed-in account's household: its name and its members, the account first. 404 for an "
        'account with no household yet.',
    )
    def get(self, request: Request) -> Response:
        return Response(household_body(signed_in_member(request)))

    @extend_schema(
        operation_id='household_partial_update',
        request=HouseholdChangesSerializer,
        responses={200: HouseholdSerializer, 400: None, 403: None, 404: None},
        description="Renames the signed-in account's household. Any member may.",
    )
    def patch(self, request: Request) -> Response:
        account = signed_in_member(request)
        changes = HouseholdChangesSerializer(data=request.data)
        changes.is_valid(raise_exception=True)
        rename_household(account, changes.validated_data['name'])
        return Response(household_body(account))


class LeaveHouseholdView(APIView):
    @extend_schema(
        operation_id='household_leave_create',
        request=None,
        responses={200: HouseholdSerializer, 403: None, 404: None},
        description='Moves the signed-in account into a new household of one, named after it, with a copy of each '
        'private recipe it wrote; the household it left keeps its own. A household left with nobody in it is deleted.',
    )
    def post(self, request: Request) -> Response:
        return Response(household_body(leave_household(signed_in_member(request))))


class HouseholdMemberView(APIView):
    @extend_schema(
        operation_id='household_members_destroy',
        parameters=[OpenApiParameter('member_id', int, OpenApiParameter.PATH)],
        responses={200: HouseholdSerializer, 403: None, 404: None},
        description="Removes another member of the signed-in account's household into a new household of one, with a "
        'copy of each private recipe they wrote (the household keeps its own), and emails them. Any member may. 404 '
        "for anyone who isn't another member of it.",
    )
    def delete(self, request: Request, member_id: int) -> Response:
        try:
            account = remove_member(signed_in_member(request), member_id)
        except User.DoesNotExist as missing:
            raise NotFound from missing
        return Response(household_body(account))


class InviteView(APIView):
    @extend_schema(
        operation_id='household_invite_create',
        request=None,
        responses={200: HouseholdSerializer, 403: None, 404: None},
        description="The signed-in account's household with a live invite link: the one it has, or a new one that "
        'works for 7 days when it has none or only an expired one. Any member may.',
    )
    def post(self, request: Request) -> Response:
        account = signed_in_member(request)
        try:
            make_invite(account)
        except Household.DoesNotExist as moved:
            raise NotFound from moved
        return Response(household_body(account))

    @extend_schema(
        operation_id='household_invite_destroy',
        responses={200: HouseholdSerializer, 403: None, 404: None},
        description="Cancels the signed-in account's household's invite link, live or expired, and answers the "
        'household. Any member may; cancelling when there is none does nothing.',
    )
    def delete(self, request: Request) -> Response:
        account = signed_in_member(request)
        try:
            cancel_invite(account)
        except Household.DoesNotExist as moved:
            raise NotFound from moved
        return Response(household_body(account))


class InviteLinkView(APIView):
    @extend_schema(
        operation_id='invite_retrieve',
        parameters=[OpenApiParameter('token', str, OpenApiParameter.PATH)],
        responses={200: JoinInviteSerializer, 404: None},
        description='Whether an invite link works and, for someone signed in, the household it joins. 404 for a '
        'token that was never an invite.',
    )
    def get(self, request: Request, token: str) -> Response:
        viewer = request.user if request.user.is_authenticated else None
        try:
            seen = invite_seen_by(token, viewer)
        except Invite.DoesNotExist as unknown:
            raise NotFound from unknown
        return Response(JoinInviteSerializer(seen).data)


class DeadInviteError(APIException):
    status_code = HTTPStatus.CONFLICT
    default_detail = 'This invite link no longer works.'
    default_code = 'invite_not_live'


class JoinView(APIView):
    @extend_schema(
        operation_id='invite_join_create',
        request=None,
        parameters=[OpenApiParameter('token', str, OpenApiParameter.PATH)],
        responses={200: HouseholdSerializer, 403: None, 404: None, 409: None},
        description="Moves the signed-in account into the invite's household with a copy of each private recipe it "
        'wrote; the household it left keeps its own, and is deleted if nobody is left in it. 404 for an unknown token, '
        '409 when the link is cancelled or expired.',
    )
    def post(self, request: Request, token: str) -> Response:
        account = signed_in_member(request)
        try:
            joined = join_household(account, token)
        except Invite.DoesNotExist as unknown:
            raise NotFound from unknown
        except InviteNotLiveError as dead:
            raise DeadInviteError from dead
        return Response(household_body(joined))


def rate_limited(request: HttpRequest, seconds: int) -> HttpResponse:
    response = RateLimitResponse(request)
    response['Retry-After'] = str(seconds)
    return response


class RequestSignInCodeView(RequestLoginCodeView):
    def handle_invalid_input(self, input: RequestLoginCodeInput) -> HttpResponse:
        refused = [error.code for error in input.errors.as_data().get('email', [])]
        if 'too_many_login_attempts' not in refused:
            return super().handle_invalid_input(input)
        email = str(input.data.get('email', '')).strip().lower()
        return rate_limited(self.request, seconds_until_allowed(self.request, 'request_login_code', key=email))


class SignUpView(SignupView):
    def handle(self, request: HttpRequest, *args: Any, **kwargs: Any) -> HttpResponseBase:
        response = super().handle(request, *args, **kwargs)
        if response.status_code != HTTPStatus.TOO_MANY_REQUESTS:
            return response
        return rate_limited(request, seconds_until_allowed(request, 'signup'))


class ConfirmSignInCodeView(ConfirmLoginCodeView):
    # The last wrong try ends the code, so it answers as a stopped code rather than leaving that to the next try.
    def handle_invalid_input(self, input: ConfirmLoginCodeInput) -> HttpResponse:
        if self.process.record_invalid_attempt():
            return ErrorResponse(self.request, input=input)
        return ConflictResponse(self.request)


class VerifyEmailCodeView(VerifyEmailView):
    # As ConfirmSignInCodeView, for the code that checks a new account's address.
    def handle_invalid_input(self, input: VerifyEmailInput) -> HttpResponse:
        if self.process.record_invalid_attempt():
            return ErrorResponse(self.request, input=input)
        return ConflictResponse(self.request)
