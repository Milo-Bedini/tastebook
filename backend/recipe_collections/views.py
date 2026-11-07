from django.core.exceptions import ValidationError as DjangoValidationError
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from recipe_collections.serializers import (
    ListSummarySerializer,
    SavedListSerializer,
    SavedRecipeSerializer,
    SaveRecipeSerializer,
    UndoSerializer,
)
from recipe_collections.services import favourites_of, lists_of, save_to_favourites, undo_unsave, unsave
from recipes.models import Recipe

SIGNED_OUT = OpenApiResponse(description='Signed out.')


def _refuse_signed_out(request: Request) -> None:
    if not request.user.is_authenticated:
        raise PermissionDenied


class ListsView(APIView):
    permission_classes = []

    @extend_schema(
        operation_id='lists_list',
        responses={200: ListSummarySerializer(many=True), 403: SIGNED_OUT},
        description="The signed-in account's lists: Favourites, even before anything is saved to it.",
    )
    def get(self, request: Request) -> Response:
        _refuse_signed_out(request)
        return Response(ListSummarySerializer(lists_of(request.user), many=True).data)


class FavouritesView(APIView):
    permission_classes = []

    @extend_schema(
        operation_id='lists_favourites_retrieve',
        responses={200: SavedListSerializer, 403: SIGNED_OUT},
        description="The signed-in account's Favourites, newest saved first. A recipe its author has since made "
        'private or deleted keeps its place with the title it was saved with and no recipe.',
    )
    def get(self, request: Request) -> Response:
        _refuse_signed_out(request)
        return Response(SavedListSerializer(favourites_of(request.user)).data)


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


class SavedRecipeView(APIView):
    permission_classes = []

    @extend_schema(
        operation_id='lists_favourites_saved_destroy',
        responses={
            200: UndoSerializer,
            403: SIGNED_OUT,
            404: OpenApiResponse(description="The account has no such saved recipe: it's been taken out already."),
        },
        description='Takes a saved recipe out of Favourites, available or not, and answers a token that puts it back.',
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
        operation_id='lists_favourites_saved_restore_create',
        request=UndoSerializer,
        responses={
            201: SavedRecipeSerializer,
            400: OpenApiResponse(description="The token is missing, over an hour old, forged or another account's."),
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
            raise ValidationError(error.message_dict) from error
        return Response(SavedRecipeSerializer(saved).data, status=status.HTTP_201_CREATED)
