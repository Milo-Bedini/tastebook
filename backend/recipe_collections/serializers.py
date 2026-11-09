from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers
from rest_framework.request import Request

from households.models import UnitSystem
from recipe_collections.models import LIST_NAME_MAX_LENGTH, SavedRecipe, Scope
from recipe_collections.services import NAME_MISSING, Download
from recipes import services as recipe_services
from recipes.models import Cuisine, DietTag, IngredientLine, Moderation, Recipe, Visibility

# A list's recipes are shown as the recipe list shows them, so these serializers answer the same fields as recipes'
# RecipeSummary. They're the collections area's own: another area's serializers aren't its public surface.


class ListedCuisineSerializer(serializers.ModelSerializer):
    class Meta:
        model = Cuisine
        fields = ['slug', 'name']


class ListedPhotoThumbnailSerializer(serializers.Serializer):
    width = serializers.IntegerField(read_only=True)
    url = serializers.URLField(read_only=True)


class ListedPhotoCreditSerializer(serializers.Serializer):
    author = serializers.CharField(read_only=True)
    licence = serializers.CharField(read_only=True)
    source_url = serializers.URLField(read_only=True)


class ListedPhotoSerializer(serializers.Serializer):
    url = serializers.URLField(read_only=True)
    thumbnails = ListedPhotoThumbnailSerializer(many=True, read_only=True)
    credit = ListedPhotoCreditSerializer(read_only=True, allow_null=True)


class ListedDietTagsField(serializers.ListField):
    child = serializers.ChoiceField(choices=DietTag.choices)


class ListedRecipeSerializer(serializers.ModelSerializer):
    visibility = serializers.ChoiceField(choices=Visibility.choices, read_only=True)
    author = serializers.SerializerMethodField(
        help_text='The name of whoever wrote a public household recipe; null for a private or catalogue recipe.'
    )
    cuisines = ListedCuisineSerializer(many=True, read_only=True)
    total_minutes = serializers.IntegerField(read_only=True, allow_null=True)
    photo = ListedPhotoSerializer(read_only=True, allow_null=True)
    diet_tags = serializers.SerializerMethodField()
    hidden_for_review = serializers.SerializerMethodField(
        help_text='Whether a report hides this recipe from everyone but its author, who alone is sent it until staff '
        'review it.'
    )
    waiting_for_review = serializers.SerializerMethodField(
        help_text='Whether its author asked to make this recipe public after making '
        f'{recipe_services.PUBLIC_A_DAY} others public that day, so it stays private until staff approve it.'
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
            'waiting_for_review',
        ]
        extra_kwargs = {
            'description': {'required': True, 'allow_blank': True},
            'difficulty': {'required': True, 'allow_blank': True},
        }

    @extend_schema_field(ListedDietTagsField(read_only=True))
    def get_diet_tags(self, recipe: Recipe) -> list[DietTag]:
        return recipe_services.diet_tags(recipe.ingredient_lines.all())

    @extend_schema_field(serializers.BooleanField())
    def get_hidden_for_review(self, recipe: Recipe) -> bool:
        return recipe.moderation == Moderation.HIDDEN

    @extend_schema_field(serializers.BooleanField())
    def get_waiting_for_review(self, recipe: Recipe) -> bool:
        return recipe.moderation == Moderation.HELD

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_author(self, recipe: Recipe) -> str | None:
        # Only publishing puts the name on show, as on the recipe list.
        if recipe.visibility != Visibility.PUBLIC or recipe.household_id is None or recipe.created_by is None:
            return None
        return recipe.created_by.name


class SavedRecipeSerializer(serializers.ModelSerializer):
    recipe = ListedRecipeSerializer(
        read_only=True,
        allow_null=True,
        help_text='null once the recipe is unavailable: its author made it private or deleted it.',
    )

    class Meta:
        model = SavedRecipe
        fields = ['id', 'title', 'saved_at', 'recipe']
        read_only_fields = fields
        extra_kwargs = {'title': {'help_text': 'The title the recipe had when it was saved.'}}


SCOPE_HELP = 'personal: only its owner sees it. household: everyone in the household sees and changes it.'


class SavedListSerializer(serializers.Serializer):
    slug = serializers.CharField(read_only=True)
    name = serializers.CharField(read_only=True)
    scope = serializers.ChoiceField(choices=Scope.choices, read_only=True, help_text=SCOPE_HELP)
    household_name = serializers.CharField(
        read_only=True, allow_null=True, help_text="The household's name for a household list; null for a personal one."
    )
    saved_recipes = SavedRecipeSerializer(many=True, read_only=True, help_text='Newest saved first.')


class ListCoverSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    photo = ListedPhotoSerializer(read_only=True, allow_null=True)


class ListSummarySerializer(serializers.Serializer):
    slug = serializers.CharField(read_only=True)
    name = serializers.CharField(read_only=True)
    scope = serializers.ChoiceField(choices=Scope.choices, read_only=True, help_text=SCOPE_HELP)
    recipe_count = serializers.IntegerField(read_only=True, help_text='Unavailable recipes count too.')
    covers = ListCoverSerializer(
        many=True, read_only=True, help_text="Up to three of the list's newest available recipes, for its fan."
    )


class ListsSerializer(serializers.Serializer):
    household_name = serializers.CharField(
        read_only=True, allow_null=True, help_text="The account's household's name; null before it has one."
    )
    household_members = serializers.IntegerField(
        read_only=True,
        help_text='How many accounts are in the household, the signed-in one included; 0 before it has one.',
    )
    lists = ListSummarySerializer(
        many=True,
        read_only=True,
        help_text="Favourites, then the account's own lists by name, then its household's by name.",
    )


class ListPlaceSerializer(serializers.Serializer):
    slug = serializers.CharField(read_only=True)
    name = serializers.CharField(read_only=True)
    scope = serializers.ChoiceField(choices=Scope.choices, read_only=True, help_text=SCOPE_HELP)
    recipe_count = serializers.IntegerField(read_only=True, help_text='Unavailable recipes count too.')
    saved_id = serializers.IntegerField(
        read_only=True,
        allow_null=True,
        help_text="The id of the save that holds the recipe in this list, which unsaving takes; null when it doesn't.",
    )


class RecipeListsSerializer(serializers.Serializer):
    household_name = serializers.CharField(
        read_only=True, allow_null=True, help_text="The account's household's name; null before it has one."
    )
    lists = ListPlaceSerializer(
        many=True,
        read_only=True,
        help_text="Favourites, then the account's own lists by name, then its household's by name.",
    )


class ListNameSerializer(serializers.Serializer):
    name = serializers.CharField(
        max_length=LIST_NAME_MAX_LENGTH,
        error_messages={'blank': NAME_MISSING, 'required': NAME_MISSING},
        help_text='Unique among the owner\'s lists, or the household\'s, ignoring case; never "Favourites".',
    )


class NewListSerializer(ListNameSerializer):
    scope = serializers.ChoiceField(choices=Scope.choices, help_text=SCOPE_HELP)


class SaveRecipeSerializer(serializers.Serializer):
    recipe = serializers.SlugField(
        help_text="The slug of a recipe the account can see: a public recipe, or its household's own."
    )


class UndoSerializer(serializers.Serializer):
    undo = serializers.CharField(help_text='Puts the recipe back where it was, for an hour.')


class SaveToListSerializer(serializers.Serializer):
    scope = serializers.ChoiceField(choices=Scope.choices, help_text=SCOPE_HELP)
    list = serializers.SlugField(help_text="The list's slug among the account's own lists, or its household's.")


# The Tastebook format, version 1 (docs/tastebook-format.md): each recipe in the catalogue file's shape, which
# recipes.services.add_described_recipes reads, with its address added.

FORMAT_VERSION = 1


def recipe_address(request: Request, recipe: Recipe) -> str:
    return request.build_absolute_uri(f'/recipes/{recipe.slug}')


class DownloadedLineSerializer(serializers.ModelSerializer):
    amount = serializers.DecimalField(
        max_digits=8, decimal_places=3, coerce_to_string=False, allow_null=True, read_only=True
    )
    amount_max = serializers.DecimalField(
        max_digits=8, decimal_places=3, coerce_to_string=False, allow_null=True, read_only=True
    )
    unit = serializers.CharField(read_only=True, help_text='One of Tastebook\'s units, or "" for none, as in "2 eggs".')
    ingredient = serializers.SlugRelatedField(slug_field='name', read_only=True, help_text="The ingredient's name.")
    note = serializers.CharField(read_only=True)
    optional = serializers.BooleanField(read_only=True)
    original_text = serializers.CharField(read_only=True)

    class Meta:
        model = IngredientLine
        fields = ['amount', 'amount_max', 'unit', 'ingredient', 'note', 'optional', 'original_text']


class DownloadedGroupSerializer(serializers.Serializer):
    name = serializers.CharField(read_only=True)
    lines = DownloadedLineSerializer(many=True, read_only=True)


class DownloadedRecipeSerializer(serializers.ModelSerializer):
    address = serializers.SerializerMethodField(help_text="The recipe's page in Tastebook.")
    title = serializers.CharField(read_only=True)
    description = serializers.CharField(read_only=True)
    cuisines = serializers.SlugRelatedField(slug_field='name', many=True, read_only=True)
    courses = serializers.SlugRelatedField(slug_field='name', many=True, read_only=True)
    difficulty = serializers.CharField(read_only=True, help_text='easy, medium, hard, or "" when not given.')
    prep_minutes = serializers.IntegerField(read_only=True, allow_null=True)
    cook_minutes = serializers.IntegerField(read_only=True, allow_null=True)
    extra_minutes = serializers.IntegerField(read_only=True)
    extra_label = serializers.CharField(read_only=True)
    servings = serializers.IntegerField(read_only=True, allow_null=True)
    yield_amount = serializers.IntegerField(read_only=True, allow_null=True)
    yield_unit = serializers.CharField(read_only=True)
    equipment = serializers.SlugRelatedField(slug_field='name', many=True, read_only=True)
    one_pot = serializers.BooleanField(read_only=True)
    source = serializers.CharField(read_only=True)
    source_url = serializers.CharField(read_only=True)
    photo_url = serializers.CharField(read_only=True, help_text='The photo\'s address, or "" for none.')
    photo_author = serializers.CharField(read_only=True)
    photo_licence = serializers.CharField(read_only=True)
    photo_source_url = serializers.CharField(read_only=True)
    ingredient_lines = DownloadedLineSerializer(
        source='ungrouped_lines', many=True, read_only=True, help_text='The lines above every group.'
    )
    ingredient_groups = DownloadedGroupSerializer(many=True, read_only=True)
    steps = serializers.SlugRelatedField(slug_field='text', many=True, read_only=True)

    class Meta:
        model = Recipe
        fields = [
            'address',
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
            'photo_author',
            'photo_licence',
            'photo_source_url',
            'ingredient_lines',
            'ingredient_groups',
            'steps',
        ]

    @extend_schema_field(serializers.URLField())
    def get_address(self, recipe: Recipe) -> str:
        return recipe_address(self.context['request'], recipe)


class DownloadedSaveSerializer(serializers.Serializer):
    title = serializers.CharField(read_only=True, help_text='The title the recipe had when it was saved.')
    saved_at = serializers.DateTimeField(read_only=True)
    address = serializers.SerializerMethodField(
        help_text="The recipe's page in Tastebook; null once the recipe is unavailable: its author made it private "
        'or deleted it.'
    )

    @extend_schema_field(serializers.URLField(allow_null=True))
    def get_address(self, saved: SavedRecipe) -> str | None:
        return recipe_address(self.context['request'], saved.recipe) if saved.recipe is not None else None


class DownloadedListSerializer(serializers.Serializer):
    name = serializers.CharField(read_only=True)
    scope = serializers.ChoiceField(choices=Scope.choices, read_only=True, help_text=SCOPE_HELP)
    saved_recipes = DownloadedSaveSerializer(many=True, read_only=True, help_text='Newest saved first.')


class DownloadedAccountSerializer(serializers.Serializer):
    name = serializers.CharField(source='account.name', read_only=True)
    email = serializers.EmailField(source='account.email', read_only=True)
    unit_system = serializers.ChoiceField(source='account.unit_system', choices=UnitSystem.choices, read_only=True)
    household_name = serializers.CharField(
        read_only=True, allow_null=True, help_text="The account's household's name; null before it has one."
    )


class DownloadSerializer(serializers.Serializer):
    format = serializers.SerializerMethodField(help_text='Always "tastebook".')
    version = serializers.SerializerMethodField(help_text=f'Always {FORMAT_VERSION} for this shape.')
    exported_at = serializers.DateTimeField(read_only=True)
    account = DownloadedAccountSerializer(source='*', read_only=True)
    recipes = DownloadedRecipeSerializer(
        many=True,
        read_only=True,
        help_text="The household's private recipes and the recipes the account wrote there, by title.",
    )
    lists = DownloadedListSerializer(
        many=True,
        read_only=True,
        help_text="Favourites, then the account's own lists by name, then its household's by name.",
    )

    @extend_schema_field(serializers.CharField())
    def get_format(self, download: Download) -> str:
        return 'tastebook'

    @extend_schema_field(serializers.IntegerField())
    def get_version(self, download: Download) -> int:
        return FORMAT_VERSION
