from django.core.exceptions import ValidationError as DjangoValidationError
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.generics import ListAPIView, RetrieveAPIView
from rest_framework.request import Request
from rest_framework.response import Response

from recipes.models import Course, Cuisine, Equipment, Ingredient, IngredientQuerySet, Recipe, RecipeQuerySet
from recipes.serializers import (
    CourseSerializer,
    CuisineSerializer,
    EquipmentSerializer,
    IngredientOptionSerializer,
    NewIngredientSerializer,
    NewRecipeSerializer,
    RecipeChangesSerializer,
    RecipeFiltersSerializer,
    RecipeIngredientsSerializer,
    RecipeSerializer,
    RecipeSummarySerializer,
)
from recipes.services import IngredientList, add_ingredient, add_recipe, delete_recipe, edit_recipe

INGREDIENT_FIELDS = tuple(RecipeIngredientsSerializer().fields)


class RecipeListView(ListAPIView):
    permission_classes = []
    serializer_class = RecipeSummarySerializer

    @extend_schema(
        parameters=[RecipeFiltersSerializer],
        responses={
            200: RecipeSummarySerializer(many=True),
            400: OpenApiResponse(
                description='A difficulty, a diet, an include_match or a time limit is not one the list accepts.'
            ),
        },
    )
    def get(self, request: Request) -> Response:
        return super().get(request)

    @extend_schema(
        operation_id='recipes_create',
        request=NewRecipeSerializer,
        responses={
            201: RecipeSerializer,
            400: OpenApiResponse(description='A field, or a pair of them, is not one a recipe can hold.'),
            403: OpenApiResponse(description='Signed out, or the account has no household yet.'),
        },
        description="Adds a private recipe to the signed-in account's household. Only the title is required. "
        '403 when signed out or for an account with no household yet.',
    )
    def post(self, request: Request) -> Response:
        if not request.user.is_authenticated or request.user.household_id is None:
            raise PermissionDenied
        given = NewRecipeSerializer(data=request.data)
        given.is_valid(raise_exception=True)
        details = dict(given.validated_data)
        cuisines, courses, equipment = details.pop('cuisines'), details.pop('courses'), details.pop('equipment')
        ingredients = IngredientList(details.pop('ingredient_lines'), details.pop('ingredient_groups'))
        steps = details.pop('steps')
        try:
            recipe = add_recipe(request.user, details, cuisines, courses, equipment, ingredients, steps)
        except DjangoValidationError as error:
            errors = error.message_dict
            raise ValidationError(
                {('non_field_errors' if key == '__all__' else key): messages for key, messages in errors.items()}
            ) from error
        added = (
            Recipe.objects.prefetch_related('cuisines', 'courses', 'equipment')
            .with_ingredients_and_method()
            .get(pk=recipe.pk)
        )
        return Response(RecipeSerializer(added, context={'request': request}).data, status=status.HTTP_201_CREATED)

    def get_queryset(self) -> RecipeQuerySet:
        filters = RecipeFiltersSerializer(data=self.request.query_params)
        filters.is_valid(raise_exception=True)
        given = filters.validated_data
        recipes = (
            Recipe.objects.visible_to(self.request.user)
            .search(given['q'])
            .with_cuisines(given['cuisine'])
            .with_courses(given['course'])
            .with_difficulties(given['difficulty'])
            .taking_at_most(prep=given.get('max_prep'), cook=given.get('max_cook'), total=given.get('max_total'))
            .only_one_pot(given['one_pot'])
            .suiting(given['diet'])
            .using_none_of(given['exclude_ingredient'])
        )
        included = given['include_ingredient']
        recipes = recipes.using_all_of(included) if given['include_match'] == 'all' else recipes.using_any_of(included)
        return recipes.prefetch_related('cuisines').with_diet_tags()


class RecipeDetailView(RetrieveAPIView):
    permission_classes = []
    serializer_class = RecipeSerializer
    lookup_field = 'slug'

    @extend_schema(
        responses={
            200: RecipeSerializer,
            404: OpenApiResponse(description="No recipe has this slug, or it's another household's."),
        }
    )
    def get(self, request: Request, slug: str) -> Response:
        return super().get(request, slug=slug)

    @extend_schema(
        operation_id='recipes_partial_update',
        request=RecipeChangesSerializer,
        responses={
            200: RecipeSerializer,
            400: OpenApiResponse(description='A field, or a pair of them, is not one a recipe can hold.'),
            403: OpenApiResponse(description='Signed out, or the account has no household yet.'),
            404: OpenApiResponse(
                description="No recipe has this slug in the account's household: there's none, "
                "it's another household's, or it's a catalogue recipe."
            ),
        },
        description="Edits a recipe of the signed-in account's household; any member may, whoever wrote it. "
        'Only the fields sent change, and the address stays as it is. '
        'Sending ingredient_lines or ingredient_groups replaces every line and group; the one left out counts as none. '
        'Sending steps replaces every step.',
    )
    def patch(self, request: Request, slug: str) -> Response:
        # Refused before the lookup, so a signed-out answer says nothing about the slug.
        if not request.user.is_authenticated or request.user.household_id is None:
            raise PermissionDenied
        recipe = get_object_or_404(Recipe.objects.editable_by(request.user), slug=slug)
        # The body is split before a serializer sees it, so its shape is checked here; a form's QueryDict is a dict.
        if not isinstance(request.data, dict):
            raise ValidationError({'non_field_errors': ['Send the changes as a JSON object.']})
        changes = request.data.copy()
        sent = {name: changes.pop(name) for name in INGREDIENT_FIELDS if name in changes}
        given = RecipeChangesSerializer(data=changes, partial=True)
        # Not partial: DRF skips a missing field at every depth of a partial update, so a line could lack its amount.
        given_ingredients = RecipeIngredientsSerializer(data=sent)
        # Both run, so one answer names every field refused.
        if not all([given.is_valid(), given_ingredients.is_valid()]):
            raise ValidationError({**given.errors, **given_ingredients.errors})
        details = dict(given.validated_data)
        cuisines, courses = details.pop('cuisines', None), details.pop('courses', None)
        equipment, steps = details.pop('equipment', None), details.pop('steps', None)
        sent_ingredients = given_ingredients.validated_data
        ingredients = (
            IngredientList(sent_ingredients['ingredient_lines'], sent_ingredients['ingredient_groups'])
            if sent
            else None
        )
        try:
            edit_recipe(recipe, details, cuisines, courses, equipment, ingredients, steps)
        except DjangoValidationError as error:
            errors = error.message_dict
            raise ValidationError(
                {('non_field_errors' if key == '__all__' else key): messages for key, messages in errors.items()}
            ) from error
        edited = self.get_queryset().get(pk=recipe.pk)
        return Response(RecipeSerializer(edited, context={'request': request}).data)

    @extend_schema(
        operation_id='recipes_destroy',
        responses={
            204: None,
            403: OpenApiResponse(description='Signed out, or the account has no household yet.'),
            404: OpenApiResponse(
                description="No recipe has this slug that the account may delete: there's none, it's another "
                "household's or a catalogue recipe, or another member wrote it and is still in the household."
            ),
        },
        description="Deletes a recipe of the signed-in account's household, with its ingredients and method. "
        'Only its author may, or any member once the author has left the household.',
    )
    def delete(self, request: Request, slug: str) -> Response:
        # Refused before the lookup, so a signed-out answer says nothing about the slug.
        if not request.user.is_authenticated or request.user.household_id is None:
            raise PermissionDenied
        recipe = get_object_or_404(Recipe.objects.deletable_by(request.user), slug=slug)
        delete_recipe(recipe)
        return Response(status=status.HTTP_204_NO_CONTENT)

    def get_queryset(self) -> RecipeQuerySet:
        # Another household's recipe answers 404, the same as no recipe.
        return (
            Recipe.objects.visible_to(self.request.user)
            .prefetch_related('cuisines', 'courses', 'equipment')
            .with_ingredients_and_method()
        )


class CuisineListView(ListAPIView):
    authentication_classes = []
    permission_classes = []
    serializer_class = CuisineSerializer
    queryset = Cuisine.objects.all()


class CourseListView(ListAPIView):
    authentication_classes = []
    permission_classes = []
    serializer_class = CourseSerializer
    queryset = Course.objects.all()


class EquipmentListView(ListAPIView):
    authentication_classes = []
    permission_classes = []
    serializer_class = EquipmentSerializer
    queryset = Equipment.objects.all()


class IngredientListView(ListAPIView):
    permission_classes = []
    serializer_class = IngredientOptionSerializer

    def get_queryset(self) -> IngredientQuerySet:
        return Ingredient.objects.offered_to(self.request.user).prefetch_related('synonyms')

    @extend_schema(
        description='Every ingredient but those awaiting review; a household is also offered the ones its recipes use.'
    )
    def get(self, request: Request) -> Response:
        return super().get(request)

    @extend_schema(
        operation_id='ingredients_create',
        request=NewIngredientSerializer,
        responses={
            200: IngredientOptionSerializer,
            201: IngredientOptionSerializer,
            400: OpenApiResponse(description='The name is blank, has no letter or is over 100 characters.'),
            403: OpenApiResponse(description='Signed out, or the account has no household yet.'),
        },
        description='Gives the ingredient with this name or synonym, ignoring case and accents (200), or adds one '
        'awaiting review (201). 403 when signed out or for an account with no household yet.',
    )
    def post(self, request: Request) -> Response:
        if not request.user.is_authenticated or request.user.household_id is None:
            raise PermissionDenied
        given = NewIngredientSerializer(data=request.data)
        given.is_valid(raise_exception=True)
        ingredient, added = add_ingredient(given.validated_data['name'])
        return Response(
            IngredientOptionSerializer(ingredient).data, status=status.HTTP_201_CREATED if added else status.HTTP_200_OK
        )
