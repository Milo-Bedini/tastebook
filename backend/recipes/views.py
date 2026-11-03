from django.core.exceptions import ValidationError as DjangoValidationError
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.generics import ListAPIView, RetrieveAPIView
from rest_framework.request import Request
from rest_framework.response import Response

from recipes.models import Course, Cuisine, Ingredient, Recipe, RecipeQuerySet
from recipes.serializers import (
    CourseSerializer,
    CuisineSerializer,
    IngredientOptionSerializer,
    NewRecipeSerializer,
    RecipeFiltersSerializer,
    RecipeSerializer,
    RecipeSummarySerializer,
)
from recipes.services import add_recipe


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
        cuisines, courses = details.pop('cuisines'), details.pop('courses')
        try:
            recipe = add_recipe(request.user, details, cuisines, courses)
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
        return Response(RecipeSerializer(added).data, status=status.HTTP_201_CREATED)

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


@extend_schema(
    responses={
        200: RecipeSerializer,
        404: OpenApiResponse(description="No recipe has this slug, or it's another household's."),
    }
)
class RecipeDetailView(RetrieveAPIView):
    permission_classes = []
    serializer_class = RecipeSerializer
    lookup_field = 'slug'

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


class IngredientListView(ListAPIView):
    authentication_classes = []
    permission_classes = []
    serializer_class = IngredientOptionSerializer
    queryset = Ingredient.objects.prefetch_related('synonyms')
