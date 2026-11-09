from collections.abc import Callable

from django.core.exceptions import ValidationError as DjangoValidationError
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import OpenApiResponse, extend_schema, extend_schema_view
from rest_framework import status
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.renderers import JSONRenderer
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from recipe_collections.models import RecipeList, Scope
from recipe_collections.serializers import (
    DownloadSerializer,
    ListNameSerializer,
    ListsSerializer,
    NewListSerializer,
    RecipeListsSerializer,
    SavedListSerializer,
    SavedRecipeSerializer,
    SaveRecipeSerializer,
    SaveToListSerializer,
    UndoSerializer,
)
from recipe_collections.services import (
    delete_list,
    download_for,
    list_of,
    lists_holding,
    lists_of,
    make_list,
    rename_list,
    save_to_favourites,
    save_to_list,
    undo_unsave,
    unsave,
)
from recipes.models import Recipe

SIGNED_OUT = OpenApiResponse(description='Signed out.')


def _refuse_signed_out(request: Request) -> None:
    if not request.user.is_authenticated:
        raise PermissionDenied


def _refused(error: DjangoValidationError) -> ValidationError:
    return ValidationError(error.message_dict)


NO_SUCH_LIST = OpenApiResponse(
    description="The account has no list with this slug, of its own or its household's: there's none, it's been "
    "deleted or renamed, or it's another account's or household's."
)
NO_CHANGEABLE_LIST = OpenApiResponse(
    description='As for GET, and Favourites, which is never renamed or deleted.',
)
NAME_REFUSED = OpenApiResponse(
    description='The name is missing, too long, "Favourites", or the name of another of the owner\'s lists.'
)


class ListsView(APIView):
    permission_classes = []

    @extend_schema(
        operation_id='lists_list',
        responses={200: ListsSerializer, 403: SIGNED_OUT},
        description='The lists the signed-in account sees: Favourites, even before anything is saved to it, its own '
        "lists and its household's, with its household's name.",
    )
    def get(self, request: Request) -> Response:
        _refuse_signed_out(request)
        return Response(ListsSerializer(lists_of(request.user)).data)

    @extend_schema(
        operation_id='lists_create',
        request=NewListSerializer,
        responses={
            201: SavedListSerializer,
            400: OpenApiResponse(
                description=f'{NAME_REFUSED.description} Or a household list for an account with no household.'
            ),
            403: SIGNED_OUT,
        },
        description="Makes an empty list, the account's own or its household's, at an address made from its name.",
    )
    def post(self, request: Request) -> Response:
        _refuse_signed_out(request)
        given = NewListSerializer(data=request.data)
        given.is_valid(raise_exception=True)
        try:
            made = make_list(request.user, given.validated_data['name'], given.validated_data['scope'])
        except DjangoValidationError as error:
            raise _refused(error) from error
        return Response(SavedListSerializer(made).data, status=status.HTTP_201_CREATED)


class ListView(APIView):
    """One list, by its slug in its owner's lists: a personal list's or a household's."""

    permission_classes = []
    scope: Scope

    def get(self, request: Request, slug: str) -> Response:
        _refuse_signed_out(request)
        found = list_of(request.user, self.scope, slug)
        if found is None:
            raise NotFound
        return Response(SavedListSerializer(found).data)

    def patch(self, request: Request, slug: str) -> Response:
        _refuse_signed_out(request)
        given = ListNameSerializer(data=request.data)
        given.is_valid(raise_exception=True)
        try:
            renamed = rename_list(request.user, self.scope, slug, given.validated_data['name'])
        except DjangoValidationError as error:
            raise _refused(error) from error
        if renamed is None:
            raise NotFound
        return Response(SavedListSerializer(renamed).data)

    def delete(self, request: Request, slug: str) -> Response:
        _refuse_signed_out(request)
        if not delete_list(request.user, self.scope, slug):
            raise NotFound
        return Response(status=status.HTTP_204_NO_CONTENT)


def _list_schema(prefix: str, whose: str) -> Callable[[type[ListView]], type[ListView]]:
    return extend_schema_view(
        get=extend_schema(
            operation_id=f'{prefix}_retrieve',
            responses={200: SavedListSerializer, 403: SIGNED_OUT, 404: NO_SUCH_LIST},
            description=f'One of {whose}, newest saved first. A recipe its author has since made private or deleted '
            'keeps its place with the title it was saved with and no recipe.',
        ),
        patch=extend_schema(
            operation_id=f'{prefix}_partial_update',
            request=ListNameSerializer,
            responses={200: SavedListSerializer, 400: NAME_REFUSED, 403: SIGNED_OUT, 404: NO_CHANGEABLE_LIST},
            description=f'Renames one of {whose}; its slug follows the new name.',
        ),
        delete=extend_schema(
            operation_id=f'{prefix}_destroy',
            responses={204: None, 403: SIGNED_OUT, 404: NO_CHANGEABLE_LIST},
            description=f'Deletes one of {whose}. Its recipes stay in Tastebook and in any other list.',
        ),
    )


# Personal lists at /api/lists/<slug>/ and household lists at /api/lists/household/<slug>/, so the two never clash.
@_list_schema('lists', "the signed-in account's own lists, Favourites among them")
class PersonalListView(ListView):
    scope = Scope.PERSONAL


@_list_schema('lists_household', "the signed-in account's household's lists, which every member sees and changes")
class HouseholdListView(ListView):
    scope = Scope.HOUSEHOLD


class FavouritesSavedView(APIView):
    permission_classes = []

    @extend_schema(
        operation_id='lists_favourites_saved_create',
        request=SaveRecipeSerializer,
        responses={
            200: SavedRecipeSerializer,
            201: SavedRecipeSerializer,
            400: OpenApiResponse(description='No recipe slug was sent.'),
            403: SIGNED_OUT,
            404: OpenApiResponse(
                description="No recipe has this slug that the account can see: there's none, or "
                "it's another household's private recipe."
            ),
        },
        description='Saves a recipe to Favourites as a link, never a copy (201), or answers the save it already has '
        '(200).',
    )
    def post(self, request: Request) -> Response:
        _refuse_signed_out(request)
        given = SaveRecipeSerializer(data=request.data)
        given.is_valid(raise_exception=True)
        recipe = get_object_or_404(Recipe.objects.visible_to(request.user), slug=given.validated_data['recipe'])
        saved, added = save_to_favourites(request.user, recipe)
        return Response(
            SavedRecipeSerializer(saved).data, status=status.HTTP_201_CREATED if added else status.HTTP_200_OK
        )


NO_SUCH_RECIPE = OpenApiResponse(
    description="No recipe has this slug that the account can see: there's none, or it's another household's private "
    'recipe.'
)


class RecipeListsView(APIView):
    """The lists that hold one recipe, and saving it to another: what a recipe's page offers."""

    permission_classes = []

    @extend_schema(
        operation_id='lists_recipes_retrieve',
        responses={200: RecipeListsSerializer, 403: SIGNED_OUT, 404: NO_SUCH_RECIPE},
        description='Every list the signed-in account sees, as the Lists page orders them, with the save that holds '
        'this recipe in each.',
    )
    def get(self, request: Request, slug: str) -> Response:
        _refuse_signed_out(request)
        recipe = get_object_or_404(Recipe.objects.visible_to(request.user), slug=slug)
        return Response(RecipeListsSerializer(lists_holding(request.user, recipe)).data)

    @extend_schema(
        operation_id='lists_recipes_create',
        request=SaveToListSerializer,
        responses={
            200: SavedRecipeSerializer,
            201: SavedRecipeSerializer,
            400: OpenApiResponse(description='No scope or list slug was sent.'),
            403: SIGNED_OUT,
            404: OpenApiResponse(
                description=f'{NO_SUCH_RECIPE.description} Or the account has no list with this scope and slug, of '
                "its own or its household's: it's been deleted or renamed, or it's another account's or household's."
            ),
        },
        description="Saves this recipe as a link, never a copy, to one of the account's lists or its household's, "
        'Favourites among them (201), or answers the save it already has there (200).',
    )
    def post(self, request: Request, slug: str) -> Response:
        _refuse_signed_out(request)
        given = SaveToListSerializer(data=request.data)
        given.is_valid(raise_exception=True)
        recipe = get_object_or_404(Recipe.objects.visible_to(request.user), slug=slug)
        try:
            saved, added = save_to_list(
                request.user, given.validated_data['scope'], given.validated_data['list'], recipe
            )
        except RecipeList.DoesNotExist as error:
            raise NotFound from error
        return Response(
            SavedRecipeSerializer(saved).data, status=status.HTTP_201_CREATED if added else status.HTTP_200_OK
        )


class SavedRecipeView(APIView):
    permission_classes = []

    @extend_schema(
        operation_id='lists_saved_destroy',
        responses={
            200: UndoSerializer,
            403: SIGNED_OUT,
            404: OpenApiResponse(
                description="No list the account sees has this saved recipe: it's been taken out already, or its "
                'list deleted.'
            ),
        },
        description="Takes a saved recipe out of any list the account sees, its own or its household's, available or "
        'not, and answers a token that puts it back.',
    )
    def delete(self, request: Request, saved_id: int) -> Response:
        _refuse_signed_out(request)
        token = unsave(request.user, saved_id)
        if token is None:
            raise NotFound
        return Response(UndoSerializer({'undo': token}).data)


class RestoreSavedView(APIView):
    permission_classes = []

    @extend_schema(
        operation_id='lists_saved_restore_create',
        request=UndoSerializer,
        responses={
            201: SavedRecipeSerializer,
            400: OpenApiResponse(
                description='The token is missing, over an hour old or forged, or its list is one the account no '
                'longer sees.'
            ),
            403: SIGNED_OUT,
        },
        description='Puts a saved recipe back in its old place, with the token taking it out answered.',
    )
    def post(self, request: Request) -> Response:
        _refuse_signed_out(request)
        given = UndoSerializer(data=request.data)
        given.is_valid(raise_exception=True)
        try:
            saved = undo_unsave(request.user, given.validated_data['undo'])
        except DjangoValidationError as error:
            raise _refused(error) from error
        return Response(SavedRecipeSerializer(saved).data, status=status.HTTP_201_CREATED)


class DownloadView(APIView):
    permission_classes = []
    # A file, so never the browsable API's page, whatever the browser accepts.
    renderer_classes = [JSONRenderer]

    @extend_schema(
        operation_id='account_download_retrieve',
        responses={200: DownloadSerializer, 403: SIGNED_OUT},
        description="Everything the signed-in account has, in the Tastebook format's version 1, as a file to save: its "
        "details, its household's private recipes and the recipes it wrote there, and every list it sees, with "
        'saved recipes as their addresses.',
    )
    def get(self, request: Request) -> Response:
        _refuse_signed_out(request)
        download = download_for(request.user)
        body = DownloadSerializer(download, context={'request': request}).data
        filename = f'tastebook-{timezone.localdate(download.exported_at).isoformat()}.json'
        return Response(body, headers={'Content-Disposition': f'attachment; filename="{filename}"'})
