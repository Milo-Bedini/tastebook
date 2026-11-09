from decimal import Decimal
from typing import Any

from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from recipes import services
from recipes.models import (
    REPORT_NOTE_MAX_LENGTH,
    Course,
    Cuisine,
    DietTag,
    Difficulty,
    Equipment,
    Ingredient,
    IngredientGroup,
    IngredientLine,
    Moderation,
    Recipe,
    ReportReason,
    ShareLink,
    Step,
    Unit,
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
    awaiting_review = serializers.BooleanField(read_only=True)

    class Meta:
        model = Ingredient
        fields = ['slug', 'name', 'grams_per_cup', 'awaiting_review']


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


class PhotoCreditSerializer(serializers.Serializer):
    author = serializers.CharField(read_only=True)
    licence = serializers.CharField(read_only=True)
    source_url = serializers.URLField(read_only=True)


class RecipePhotoSerializer(serializers.Serializer):
    url = serializers.URLField(read_only=True, help_text="The photo's address, which a recipe's photo_url takes.")
    thumbnails = PhotoThumbnailSerializer(many=True, read_only=True)
    credit = PhotoCreditSerializer(
        read_only=True, allow_null=True, help_text="A Wikimedia Commons photo's credit; null for an uploaded photo."
    )


# The schema's default for a file is a URI, which holds only when requests and responses get components of their own.
@extend_schema_field(OpenApiTypes.BINARY)
class UploadedFileField(serializers.FileField):
    pass


class PhotoUploadSerializer(serializers.Serializer):
    photo = UploadedFileField(
        allow_empty_file=False,
        help_text='A JPEG, PNG, WebP or HEIC photo of up to 10 MB, which the browser has resized to 1,600 px.',
        error_messages={'required': 'Choose a photo.', 'empty': 'Choose a photo.', 'invalid': 'Choose a photo.'},
    )


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
    author = serializers.SerializerMethodField(
        help_text='The name of whoever wrote a public household recipe, shown as "by <name>"; '
        'null for a private or catalogue recipe.'
    )
    cuisines = CuisineSerializer(many=True, read_only=True)
    # null unless prep and cook times are both given.
    total_minutes = serializers.IntegerField(read_only=True, allow_null=True)
    # null when the recipe has no photo, so the card shows its cuisine plate.
    photo = RecipePhotoSerializer(read_only=True, allow_null=True)
    diet_tags = serializers.SerializerMethodField()
    hidden_for_review = serializers.SerializerMethodField(
        help_text='Whether a report hides this recipe from everyone but its author, who alone is sent it until staff '
        'review it.'
    )

    class Meta:
        model = Recipe
        fields = [
            'id',
            'slug',
            'visibility',
            'author',
            'title',
            'description',
            'cuisines',
            'difficulty',
            'total_minutes',
            'photo',
            'diet_tags',
            'hidden_for_review',
        ]
        # The API always sends these, as '' when there is none, so the schema marks them required.
        extra_kwargs = {
            'description': {'required': True, 'allow_blank': True},
            'difficulty': {'required': True, 'allow_blank': True},
        }

    @extend_schema_field(DietTagsField(read_only=True))
    def get_diet_tags(self, recipe: Recipe) -> list[DietTag]:
        return services.diet_tags(recipe.ingredient_lines.all())

    @extend_schema_field(OpenApiTypes.BOOL)
    def get_hidden_for_review(self, recipe: Recipe) -> bool:
        return recipe.moderation == Moderation.HIDDEN

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_author(self, recipe: Recipe) -> str | None:
        # Only publishing puts the name on show, so a private recipe's household isn't sent it either.
        if recipe.visibility != Visibility.PUBLIC or recipe.household_id is None or recipe.created_by is None:
            return None
        return recipe.created_by.name


class OriginalRecipeSerializer(serializers.Serializer):
    slug = serializers.CharField(read_only=True)
    title = serializers.CharField(read_only=True)
    author = serializers.CharField(
        read_only=True,
        allow_null=True,
        help_text='The name of whoever wrote the original, by the rule the recipe\'s own "author" follows.',
    )


class RecipeSerializer(RecipeSummarySerializer):
    adapted_from = serializers.SerializerMethodField(
        help_text='The recipe this is a copy of, shown as "Copied from <title>" on a private copy and "Adapted from '
        '<title> by <author>" on a public one; null for a recipe that is no copy, or when its original was deleted or '
        "the signed-in account can't see it."
    )
    is_copy = serializers.BooleanField(
        read_only=True,
        help_text='Whether this recipe was made as a copy of another, which it stays once its original is deleted or '
        'made private: with adapted_from null, it\'s shown as "Adapted from a recipe that\'s no longer public".',
    )
    original_source = serializers.CharField(
        read_only=True,
        help_text="A catalogue original's source credit, with its licence, which a copy of it keeps and can't edit; "
        "'' for any other recipe.",
    )
    original_source_url = serializers.CharField(
        read_only=True, help_text="The page original_source links to, or '' when there is none."
    )
    courses = CourseSerializer(many=True, read_only=True)
    equipment = EquipmentSerializer(many=True, read_only=True)
    # Lines in no group, shown before the groups; ungrouped_lines exists only on with_ingredients_and_method().
    ingredient_lines = IngredientLineSerializer(many=True, read_only=True, source='ungrouped_lines')
    ingredient_groups = IngredientGroupSerializer(many=True, read_only=True)
    steps = StepSerializer(many=True, read_only=True)
    # The optional ingredients that would take a diet tag away: "leave out the parmesan to keep it vegan".
    diet_tag_conflicts = serializers.SerializerMethodField()
    can_delete = serializers.SerializerMethodField(
        help_text='Whether the signed-in account may delete this recipe: its author, '
        'or any member of its household once the author has left it.'
    )
    can_edit = serializers.SerializerMethodField(
        help_text='Whether the signed-in account may edit this recipe: any member of its household while it is '
        'private, only its author once it is public.'
    )
    can_publish = serializers.SerializerMethodField(
        help_text='Whether the signed-in account may make this recipe public or private: its author, while it is in '
        'their household.'
    )
    save_count = serializers.SerializerMethodField(
        help_text='How many other accounts have saved this recipe, which its delete dialog warns of; '
        'null unless the signed-in account may delete it.'
    )
    can_share = serializers.SerializerMethodField(
        help_text='Whether the signed-in account may turn a share link to this recipe on or off: its author, while it '
        'is private and in their household.'
    )
    share_token = serializers.SerializerMethodField(
        help_text="The token of the recipe's share link, which /shared/<token> opens; null unless the signed-in "
        'account may share it and the link is on.'
    )
    can_report = serializers.SerializerMethodField(
        help_text="Whether the page offers Report recipe: on a household's public recipe, to anyone outside that "
        'household, signed in or not.'
    )
    reported = serializers.SerializerMethodField(
        help_text='Whether the signed-in account has reported this recipe, which it may do once.'
    )

    class Meta(RecipeSummarySerializer.Meta):
        fields = [
            *RecipeSummarySerializer.Meta.fields,
            'adapted_from',
            'is_copy',
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
            'original_source',
            'original_source_url',
            'ingredient_lines',
            'ingredient_groups',
            'steps',
            'diet_tag_conflicts',
            'can_delete',
            'can_edit',
            'can_publish',
            'save_count',
            'can_share',
            'share_token',
            'can_report',
            'reported',
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

    @extend_schema_field(OriginalRecipeSerializer(allow_null=True))
    def get_adapted_from(self, recipe: Recipe) -> dict[str, str | None] | None:
        if recipe.adapted_from_id is None:
            return None
        # Only an original the account can see is named, so a copy says nothing of another household's private recipe.
        visible = Recipe.objects.visible_to(self.context['request'].user).filter(pk=recipe.adapted_from_id)
        original = visible.select_related('created_by').first()
        if original is None:
            return None
        return {'slug': original.slug, 'title': original.title, 'author': self.get_author(original)}

    @extend_schema_field(OpenApiTypes.BOOL)
    def get_can_delete(self, recipe: Recipe) -> bool:
        return Recipe.objects.deletable_by(self.context['request'].user).filter(pk=recipe.pk).exists()

    @extend_schema_field(OpenApiTypes.BOOL)
    def get_can_edit(self, recipe: Recipe) -> bool:
        return Recipe.objects.editable_by(self.context['request'].user).filter(pk=recipe.pk).exists()

    @extend_schema_field(OpenApiTypes.BOOL)
    def get_can_publish(self, recipe: Recipe) -> bool:
        return Recipe.objects.publishable_by(self.context['request'].user).filter(pk=recipe.pk).exists()

    @extend_schema_field(serializers.IntegerField(allow_null=True))
    def get_save_count(self, recipe: Recipe) -> int | None:
        user = self.context['request'].user
        if not self.get_can_delete(recipe):
            return None
        return services.save_count(recipe, excluding=user)

    @extend_schema_field(OpenApiTypes.BOOL)
    def get_can_share(self, recipe: Recipe) -> bool:
        return recipe.visibility == Visibility.PRIVATE and self.get_can_publish(recipe)

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_share_token(self, recipe: Recipe) -> str | None:
        if not self.get_can_share(recipe):
            return None
        return ShareLink.objects.filter(recipe=recipe).values_list('token', flat=True).first()

    @extend_schema_field(OpenApiTypes.BOOL)
    def get_can_report(self, recipe: Recipe) -> bool:
        return services.offers_report(recipe, self.context['request'].user)

    @extend_schema_field(OpenApiTypes.BOOL)
    def get_reported(self, recipe: Recipe) -> bool:
        return services.has_reported(recipe, self.context['request'].user)


class SharedRecipeSerializer(RecipeSerializer):
    """A recipe as its share link shows it to anyone: the recipe itself, and nothing of the household's (no author,
    no copy's original, nothing only a member may do)."""

    class Meta(RecipeSerializer.Meta):
        fields = [
            'id',
            'title',
            'description',
            'cuisines',
            'courses',
            'difficulty',
            'total_minutes',
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
            'original_source',
            'original_source_url',
            'photo',
            'diet_tags',
            'ingredient_lines',
            'ingredient_groups',
            'steps',
            'diet_tag_conflicts',
        ]


NOT_A_VISIBILITY = 'Say whether the recipe is public or private.'


class RecipeVisibilitySerializer(serializers.Serializer):
    visibility = serializers.ChoiceField(
        choices=Visibility.choices,
        error_messages={'required': NOT_A_VISIBILITY, 'invalid_choice': NOT_A_VISIBILITY},
    )


NO_REASON = "Choose what's wrong with it, like Spam."


class NewReportSerializer(serializers.Serializer):
    reason = serializers.ChoiceField(
        choices=ReportReason.choices, error_messages={'required': NO_REASON, 'invalid_choice': NO_REASON}
    )
    note = serializers.CharField(
        max_length=REPORT_NOTE_MAX_LENGTH,
        allow_blank=True,
        required=False,
        error_messages={'max_length': f'Keep the note to {REPORT_NOTE_MAX_LENGTH} characters.'},
        help_text="Anything that helps staff, like where it was copied from. '' when left out.",
    )


class ReportOutcomeSerializer(serializers.Serializer):
    hidden = serializers.BooleanField(
        read_only=True,
        help_text='Whether the report hid the recipe from everyone but its author. False once staff have restored it '
        'after an earlier report, as later reports reach staff without hiding it.',
    )


NO_INGREDIENT_NAME = "Type the ingredient's name."


class NewIngredientSerializer(serializers.Serializer):
    """The name of an ingredient someone adds from the recipe form."""

    name = serializers.CharField(
        max_length=100,
        error_messages={
            'blank': NO_INGREDIENT_NAME,
            'required': NO_INGREDIENT_NAME,
            'max_length': 'Give a name of 100 characters or fewer.',
        },
    )

    def validate_name(self, name: str) -> str:
        collapsed = ' '.join(name.split())
        if not any(character.isalpha() for character in collapsed):
            raise serializers.ValidationError('Give the ingredient a name with a letter in it.')
        return collapsed


def _ingredients_named_in(data: object) -> set[str]:
    """Every string given as a line's ingredient anywhere in the request, however it's nested."""
    if isinstance(data, list):
        return set().union(*(_ingredients_named_in(item) for item in data))
    if not isinstance(data, dict):
        return set()
    named = {data['ingredient']} if isinstance(data.get('ingredient'), str) else set()
    return named.union(*(_ingredients_named_in(value) for value in data.values()))


class IngredientSlugField(serializers.SlugRelatedField):
    """A line's ingredient by slug, looked up with every other line's in one query, as a recipe may have 100."""

    def __init__(self) -> None:
        super().__init__(slug_field='slug', queryset=Ingredient.objects.all())

    def to_internal_value(self, data: object) -> Ingredient:
        known = self._known()
        if isinstance(data, str) and data in known:
            return known[data]
        # Answers DRF's own message for a slug no ingredient has.
        return super().to_internal_value(data)

    def _known(self) -> dict[str, Ingredient]:
        root = self.root
        if not hasattr(root, '_ingredients_by_slug'):
            named = _ingredients_named_in(getattr(root, 'initial_data', None))
            root._ingredients_by_slug = Ingredient.objects.in_bulk(named, field_name='slug')
        return root._ingredients_by_slug


class NewIngredientLineSerializer(serializers.Serializer):
    amount = serializers.DecimalField(
        max_digits=8,
        decimal_places=3,
        coerce_to_string=False,
        allow_null=True,
        min_value=Decimal('0.001'),
        error_messages={'min_value': 'Give an amount above 0, or leave it empty.'},
    )
    amount_max = serializers.DecimalField(max_digits=8, decimal_places=3, coerce_to_string=False, allow_null=True)
    unit = serializers.ChoiceField(choices=Unit.choices, allow_blank=True)
    ingredient = IngredientSlugField()
    note = serializers.CharField(max_length=200, allow_blank=True)
    optional = serializers.BooleanField()
    original_text = serializers.CharField(max_length=300, allow_blank=True)

    def validate(self, line: dict[str, Any]) -> dict[str, Any]:
        # The model's range_rises constraint, checked here so a refusal names its line.
        if line['amount_max'] is not None and (line['amount'] is None or line['amount_max'] <= line['amount']):
            raise serializers.ValidationError(
                {'amount_max': 'Give a range with its lower amount first, such as 2 up to 3.'}
            )
        return line


class NewIngredientGroupSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=100, error_messages={'blank': 'Give the group a name, like For the sauce.'})
    lines = NewIngredientLineSerializer(many=True, max_length=100)


class RecipeIngredientsSerializer(serializers.Serializer):
    """A recipe's lines and groups. Sending either replaces every line and group; the one left out counts as none."""

    ingredient_lines = NewIngredientLineSerializer(many=True, max_length=100, required=False, default=list)
    ingredient_groups = NewIngredientGroupSerializer(many=True, max_length=20, required=False, default=list)


STEP_MAX_LENGTH = 2000
MAX_STEPS = 100
BLANK_STEP = 'Write the step, or remove it.'

BLANK_TITLE = "Give the recipe a title, like Grandma's curry."


class NewRecipeSerializer(RecipeIngredientsSerializer, serializers.ModelSerializer):
    """What the form sends to add a recipe. Only the title is required."""

    title = serializers.CharField(max_length=200, error_messages={'blank': BLANK_TITLE, 'required': BLANK_TITLE})
    cuisines = serializers.SlugRelatedField(
        many=True, slug_field='slug', queryset=Cuisine.objects.all(), required=False, default=list
    )
    courses = serializers.SlugRelatedField(
        many=True, slug_field='slug', queryset=Course.objects.all(), required=False, default=list
    )
    equipment = serializers.SlugRelatedField(
        many=True, slug_field='slug', queryset=Equipment.objects.all(), required=False, default=list
    )
    steps = serializers.ListField(
        child=serializers.CharField(
            max_length=STEP_MAX_LENGTH,
            error_messages={
                'blank': BLANK_STEP,
                'null': BLANK_STEP,
                'max_length': f'Keep a step to {STEP_MAX_LENGTH:,} characters. Split this one in two.',
            },
        ),
        max_length=MAX_STEPS,
        required=False,
        default=list,
        error_messages={'max_length': f'Keep the method to {MAX_STEPS} steps.'},
        help_text='The method, a step each, in order. Sending it replaces every step.',
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
            'equipment',
            'one_pot',
            'source',
            'source_url',
            'photo_url',
            'ingredient_lines',
            'ingredient_groups',
            'steps',
        ]
        extra_kwargs = {
            'photo_url': {
                'help_text': "The address of a photo uploaded with POST /api/photos/, or '' for none.",
            }
        }


class RecipeChangesSerializer(NewRecipeSerializer):
    """What the form sends to edit a recipe: the fields it has, each optional. The title can't be blanked."""
