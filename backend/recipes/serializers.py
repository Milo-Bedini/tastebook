from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from recipes import services
from recipes.models import (
    Course,
    Cuisine,
    DietTag,
    Difficulty,
    Equipment,
    Ingredient,
    IngredientGroup,
    IngredientLine,
    Recipe,
    Step,
    Visibility,
)


class CuisineSerializer(serializers.ModelSerializer):
    class Meta:
        model = Cuisine
        fields = ['slug', 'name']


class CourseSerializer(serializers.ModelSerializer):
    class Meta:
        model = Course
        fields = ['slug', 'name']


class EquipmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Equipment
        fields = ['slug', 'name']


class IngredientSerializer(serializers.ModelSerializer):
    # Declared read-only so the schema lists it as always sent; a blank=True field would come out optional.
    grams_per_cup = serializers.IntegerField(read_only=True, allow_null=True)

    class Meta:
        model = Ingredient
        fields = ['slug', 'name', 'grams_per_cup']


class IngredientOptionSerializer(serializers.ModelSerializer):
    """An ingredient as the filters offer it, with the synonyms it can be found by."""

    synonyms = serializers.SlugRelatedField(many=True, read_only=True, slug_field='name')

    class Meta:
        model = Ingredient
        fields = ['slug', 'name', 'synonyms']


class IngredientLineSerializer(serializers.ModelSerializer):
    ingredient = IngredientSerializer(read_only=True)
    # Numbers, not strings, so the page can format and later scale them.
    amount = serializers.DecimalField(max_digits=8, decimal_places=3, coerce_to_string=False, allow_null=True)
    amount_max = serializers.DecimalField(max_digits=8, decimal_places=3, coerce_to_string=False, allow_null=True)

    class Meta:
        model = IngredientLine
        fields = ['id', 'amount', 'amount_max', 'unit', 'ingredient', 'note', 'optional', 'original_text']
        extra_kwargs = {
            'unit': {'required': True, 'allow_blank': True},
            'note': {'required': True, 'allow_blank': True},
            'optional': {'required': True},
            'original_text': {'required': True, 'allow_blank': True},
        }


class IngredientGroupSerializer(serializers.ModelSerializer):
    lines = IngredientLineSerializer(many=True, read_only=True)

    class Meta:
        model = IngredientGroup
        fields = ['id', 'name', 'lines']


class StepSerializer(serializers.ModelSerializer):
    class Meta:
        model = Step
        fields = ['id', 'text']


class PhotoThumbnailSerializer(serializers.Serializer):
    width = serializers.IntegerField(read_only=True)
    url = serializers.URLField(read_only=True)


class RecipePhotoSerializer(serializers.Serializer):
    thumbnails = PhotoThumbnailSerializer(many=True, read_only=True)
    author = serializers.CharField(read_only=True)
    licence = serializers.CharField(read_only=True)
    source_url = serializers.URLField(read_only=True)


class DietTagsField(serializers.ListField):
    child = serializers.ChoiceField(choices=DietTag.choices)


class DietTagConflictSerializer(serializers.Serializer):
    ingredient = IngredientSerializer(read_only=True)
    diet_tags = DietTagsField(read_only=True)


class RecipeFiltersSerializer(serializers.Serializer):
    """The list's query parameters. Validates them only; it never serialises a recipe."""

    q = serializers.CharField(
        required=False,
        default='',
        allow_blank=True,
        help_text=(
            "Title, description, an ingredient's name or synonym, or a cuisine contains this text, "
            'ignoring case and accents. Title matches come first, then the others, alphabetically within each.'
        ),
    )
    # Blank slugs are allowed so ?cuisine= still means every cuisine, as it did before the list took several.
    cuisine = serializers.ListField(
        child=serializers.CharField(allow_blank=True),
        required=False,
        default=list,
        help_text=(
            'Recipes with any of these cuisines, by slug. Unknown slugs are dropped; '
            'with none left, nothing is filtered.'
        ),
    )
    course = serializers.ListField(
        child=serializers.CharField(allow_blank=True),
        required=False,
        default=list,
        help_text=(
            'Recipes with any of these courses, by slug. Unknown slugs are dropped; '
            'with none left, nothing is filtered.'
        ),
    )
    difficulty = serializers.ListField(
        child=serializers.ChoiceField(choices=Difficulty.choices),
        required=False,
        default=list,
        help_text='Recipes with any of these difficulties. Any other value is a 400.',
    )
    max_prep = serializers.IntegerField(
        required=False,
        min_value=1,
        help_text='Prep time is this many minutes or fewer. A value that is not a whole number of at least 1 is a 400.',
    )
    max_cook = serializers.IntegerField(
        required=False,
        min_value=1,
        help_text='Cook time is this many minutes or fewer. A value that is not a whole number of at least 1 is a 400.',
    )
    max_total = serializers.IntegerField(
        required=False,
        min_value=1,
        help_text=(
            'Prep plus cook plus extra time is this many minutes or fewer. '
            'A value that is not a whole number of at least 1 is a 400.'
        ),
    )
    one_pot = serializers.BooleanField(
        required=False,
        default=False,
        help_text='true means only one-pot recipes; false or missing means every recipe.',
    )
    diet = serializers.ListField(
        child=serializers.ChoiceField(choices=DietTag.choices),
        required=False,
        default=list,
        help_text=(
            "Recipes with every one of these diet tags, worked out as each recipe's diet_tags are. "
            'Any other value is a 400.'
        ),
    )
    include_ingredient = serializers.ListField(
        child=serializers.CharField(allow_blank=True),
        required=False,
        default=list,
        help_text=(
            'Recipes with a line, optional or not, using any of these ingredients (every one with include_match=all), '
            'by slug. Unknown slugs are dropped; with none left, nothing is filtered.'
        ),
    )
    include_match = serializers.ChoiceField(
        choices=['any', 'all'],
        required=False,
        default='any',
        help_text=(
            'any (or missing) means a recipe needs one of the include_ingredient ingredients; '
            'all means it needs every one of them. Any other value is a 400.'
        ),
    )
    exclude_ingredient = serializers.ListField(
        child=serializers.CharField(allow_blank=True),
        required=False,
        default=list,
        help_text=(
            'Recipes with no line, optional or not, using any of these ingredients, by slug. '
            'Unknown slugs exclude nothing.'
        ),
    )


class RecipeSummarySerializer(serializers.ModelSerializer):
    visibility = serializers.ChoiceField(choices=Visibility.choices, read_only=True)
    cuisines = CuisineSerializer(many=True, read_only=True)
    # null unless prep and cook times are both given.
    total_minutes = serializers.IntegerField(read_only=True, allow_null=True)
    # null when the recipe has no photo, so the card shows its cuisine plate.
    photo = RecipePhotoSerializer(read_only=True, allow_null=True)
    diet_tags = serializers.SerializerMethodField()

    class Meta:
        model = Recipe
        fields = [
            'id',
            'slug',
            'visibility',
            'title',
            'description',
            'cuisines',
            'difficulty',
            'total_minutes',
            'photo',
            'diet_tags',
        ]
        # The API always sends these, as '' when there is none, so the schema marks them required.
        extra_kwargs = {
            'description': {'required': True, 'allow_blank': True},
            'difficulty': {'required': True, 'allow_blank': True},
        }

    @extend_schema_field(DietTagsField(read_only=True))
    def get_diet_tags(self, recipe: Recipe) -> list[DietTag]:
        return services.diet_tags(recipe.ingredient_lines.all())


class RecipeSerializer(RecipeSummarySerializer):
    courses = CourseSerializer(many=True, read_only=True)
    equipment = EquipmentSerializer(many=True, read_only=True)
    # Lines in no group, shown before the groups; ungrouped_lines exists only on with_ingredients_and_method().
    ingredient_lines = IngredientLineSerializer(many=True, read_only=True, source='ungrouped_lines')
    ingredient_groups = IngredientGroupSerializer(many=True, read_only=True)
    steps = StepSerializer(many=True, read_only=True)
    # The optional ingredients that would take a diet tag away: "leave out the parmesan to keep it vegan".
    diet_tag_conflicts = serializers.SerializerMethodField()

    class Meta(RecipeSummarySerializer.Meta):
        fields = [
            *RecipeSummarySerializer.Meta.fields,
            'courses',
            'prep_minutes',
            'cook_minutes',
            'extra_minutes',
            'extra_label',
            'servings',
            'yield_amount',
            'yield_unit',
            'equipment',
            'one_pot',
            'source',
            'source_url',
            'ingredient_lines',
            'ingredient_groups',
            'steps',
            'diet_tag_conflicts',
        ]
        # The API always sends these, even when they're '', null or their default, so the schema marks them required.
        extra_kwargs = {
            **RecipeSummarySerializer.Meta.extra_kwargs,
            'prep_minutes': {'required': True, 'allow_null': True},
            'cook_minutes': {'required': True, 'allow_null': True},
            'extra_minutes': {'required': True},
            'extra_label': {'required': True, 'allow_blank': True},
            'yield_unit': {'required': True, 'allow_blank': True},
            'servings': {'required': True, 'allow_null': True},
            'yield_amount': {'required': True, 'allow_null': True},
            'one_pot': {'required': True},
            'source': {'required': True, 'allow_blank': True},
            'source_url': {'required': True, 'allow_blank': True},
        }

    # Reuses the lines with_ingredients_and_method() prefetched, rather than fetching every line again.
    def _all_lines(self, recipe: Recipe) -> list[IngredientLine]:
        return [
            *recipe.ungrouped_lines,
            *(line for group in recipe.ingredient_groups.all() for line in group.lines.all()),
        ]

    @extend_schema_field(DietTagsField(read_only=True))
    def get_diet_tags(self, recipe: Recipe) -> list[DietTag]:
        return services.diet_tags(self._all_lines(recipe))

    @extend_schema_field(DietTagConflictSerializer(many=True))
    def get_diet_tag_conflicts(self, recipe: Recipe) -> list[dict[str, object]]:
        return DietTagConflictSerializer(services.diet_tag_conflicts(self._all_lines(recipe)), many=True).data


BLANK_TITLE = "Give the recipe a title, like Grandma's curry."


class NewRecipeSerializer(serializers.ModelSerializer):
    """What the form sends to add a recipe. Only the title is required."""

    title = serializers.CharField(max_length=200, error_messages={'blank': BLANK_TITLE, 'required': BLANK_TITLE})
    cuisines = serializers.SlugRelatedField(
        many=True, slug_field='slug', queryset=Cuisine.objects.all(), required=False, default=list
    )
    courses = serializers.SlugRelatedField(
        many=True, slug_field='slug', queryset=Course.objects.all(), required=False, default=list
    )

    class Meta:
        model = Recipe
        fields = [
            'title',
            'description',
            'cuisines',
            'courses',
            'difficulty',
            'prep_minutes',
            'cook_minutes',
            'extra_minutes',
            'extra_label',
            'servings',
            'yield_amount',
            'yield_unit',
            'one_pot',
            'source',
            'source_url',
        ]


class RecipeChangesSerializer(NewRecipeSerializer):
    """What the form sends to edit a recipe: the fields it has, each optional. The title can't be blanked."""
