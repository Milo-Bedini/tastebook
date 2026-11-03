from functools import reduce
from operator import or_
from typing import Any

from django.contrib.auth.models import AnonymousUser
from django.core.validators import MinValueValidator, RegexValidator
from django.db import models
from django.db.models import Case, F, Q, Value, When
from django.db.models.functions import Lower

from households.models import Household, User
from recipes.photos import COMMONS_FILE, COMMONS_FILE_PAGE, Photo
from recipes.slugs import base_slug, first_free_slug, random_suffix


class Cuisine(models.Model):
    name = models.CharField(max_length=50, unique=True)
    slug = models.SlugField(max_length=50, unique=True)

    class Meta:
        # Every list of cuisines (the endpoint, a recipe's own) reads alphabetically.
        ordering = ['name']

    def __str__(self) -> str:
        return self.name


class Course(models.Model):
    name = models.CharField(max_length=50, unique=True)
    slug = models.SlugField(max_length=50, unique=True)

    class Meta:
        ordering = ['name']

    def __str__(self) -> str:
        return self.name


class Equipment(models.Model):
    name = models.CharField(max_length=50, unique=True)
    slug = models.SlugField(max_length=50, unique=True)

    class Meta:
        ordering = ['name']
        verbose_name_plural = 'equipment'

    def __str__(self) -> str:
        return self.name


class Difficulty(models.TextChoices):
    EASY = 'easy', 'Easy'
    MEDIUM = 'medium', 'Medium'
    HARD = 'hard', 'Hard'


class Visibility(models.TextChoices):
    PUBLIC = 'public', 'Public'
    PRIVATE = 'private', 'Private'


class RecipeQuerySet(models.QuerySet['Recipe']):
    def alphabetical(self) -> RecipeQuerySet:
        # id breaks ties, so the recipe added first comes first when two titles match.
        return self.order_by(Lower('title'), 'id')

    def search(self, text: str) -> RecipeQuerySet:
        """Recipes whose title, description, ingredients or cuisines contain the text, title matches first."""
        term = text.strip()
        if term == '':
            return self.alphabetical()
        # unaccent is bilateral, so the term loses its accents too: 'crème' and 'creme' both find 'Crème brûlée'.
        in_title = Q(title__unaccent__icontains=term)
        lines = IngredientLine.objects.filter(ingredient__in=Ingredient.objects.named(term))
        cuisines = Cuisine.objects.filter(name__unaccent__icontains=term)
        # Subqueries, not joins, so a recipe matching through several lines or cuisines is listed once.
        return self.filter(
            in_title
            | Q(description__unaccent__icontains=term)
            | Q(pk__in=lines.values('recipe'))
            | Q(pk__in=cuisines.values('recipes'))
        ).order_by(Case(When(in_title, then=Value(0)), default=Value(1)), Lower('title'), 'id')

    def _having_any_of(self, known: models.QuerySet[Any], recipe_field: str) -> RecipeQuerySet:
        # Unknown slugs (a removed cuisine, a mistyped link) are dropped; with none left, nothing is filtered.
        if not known.exists():
            return self
        # A subquery, not a join, so a recipe with two of them is listed once.
        return self.filter(pk__in=known.values(recipe_field))

    def with_cuisines(self, slugs: list[str]) -> RecipeQuerySet:
        return self._having_any_of(Cuisine.objects.filter(slug__in=slugs), 'recipes')

    def with_courses(self, slugs: list[str]) -> RecipeQuerySet:
        return self._having_any_of(Course.objects.filter(slug__in=slugs), 'recipes')

    def using_any_of(self, slugs: list[str]) -> RecipeQuerySet:
        return self._having_any_of(Ingredient.objects.filter(slug__in=slugs), 'lines__recipe')

    def using_all_of(self, slugs: list[str]) -> RecipeQuerySet:
        """Recipes with a line, optional or not, for every one of these ingredients. Unknown slugs are dropped."""
        known = Ingredient.objects.filter(slug__in=slugs).values_list('pk', flat=True)
        # One subquery per ingredient, so each must have its own line; with none known, nothing is filtered.
        return reduce(
            lambda recipes, pk: recipes.filter(pk__in=IngredientLine.objects.filter(ingredient=pk).values('recipe')),
            known,
            self,
        )

    def using_none_of(self, slugs: list[str]) -> RecipeQuerySet:
        """Recipes with no line, optional or not, using any of these ingredients."""
        if not slugs:
            return self
        lines = IngredientLine.objects.filter(ingredient__slug__in=slugs)
        return self.exclude(pk__in=lines.values('recipe'))

    def suiting(self, diets: list[str]) -> RecipeQuerySet:
        """Recipes with every one of these diet tags, by the rule services.diet_tags() follows."""
        if not diets:
            return self
        # Every diet must hold, so a line breaking any one of them rules the recipe out.
        flags = sorted({flag for diet in diets for flag in RULED_OUT_BY[DietTag(diet)]})
        required = IngredientLine.objects.filter(optional=False)
        ruled_out = required.filter(reduce(or_, (Q(**{f'ingredient__{flag}': True}) for flag in flags)))
        # A recipe with no required line claims no diet, as diet_tags() says.
        return self.filter(pk__in=required.values('recipe')).exclude(pk__in=ruled_out.values('recipe'))

    def with_difficulties(self, difficulties: list[str]) -> RecipeQuerySet:
        return self.filter(difficulty__in=difficulties) if difficulties else self

    def taking_at_most(self, *, prep: int | None, cook: int | None, total: int | None) -> RecipeQuerySet:
        limits = {'prep_minutes__lte': prep, 'cook_minutes__lte': cook, 'minutes_in_all__lte': total}
        # The same sum as Recipe.total_minutes, in SQL so the database can filter on it.
        return self.alias(minutes_in_all=F('prep_minutes') + F('cook_minutes') + F('extra_minutes')).filter(
            **{lookup: minutes for lookup, minutes in limits.items() if minutes is not None}
        )

    def only_one_pot(self, only: bool) -> RecipeQuerySet:
        return self.filter(one_pot=True) if only else self

    def with_ingredients_and_method(self) -> RecipeQuerySet:
        lines = IngredientLine.objects.select_related('ingredient')
        # Lines in no group land in ungrouped_lines, so a group's lines aren't listed twice.
        return self.prefetch_related(
            models.Prefetch('ingredient_lines', queryset=lines.filter(group=None), to_attr='ungrouped_lines'),
            models.Prefetch('ingredient_groups__lines', queryset=lines),
            'steps',
        )

    def with_diet_tags(self) -> RecipeQuerySet:
        # Every line with its ingredient, grouped or not, as the diet tags are worked out from them all.
        lines = IngredientLine.objects.select_related('ingredient')
        return self.prefetch_related(models.Prefetch('ingredient_lines', queryset=lines))

    def unique_slug_for(self, title: str) -> str:
        base = base_slug(title)
        taken = set(self.filter(slug__startswith=base).values_list('slug', flat=True))
        return first_free_slug(base, taken)

    def private_slug_for(self, title: str) -> str:
        """The title's slug and six random characters, so it says nothing about other households' titles."""
        base = base_slug(title)
        while True:
            slug = f'{base}-{random_suffix()}'
            if not self.filter(slug=slug).exists():
                return slug

    def catalogue(self) -> RecipeQuerySet:
        return self.filter(household__isnull=True)

    def visible_to(self, user: User | AnonymousUser) -> RecipeQuerySet:
        """Catalogue recipes, and the recipes of the user's household when they're signed in to one."""
        household_id = user.household_id if user.is_authenticated else None
        if household_id is None:
            return self.catalogue()
        return self.filter(Q(household__isnull=True) | Q(household_id=household_id))


class Recipe(models.Model):
    title = models.CharField(max_length=200)
    description = models.CharField(max_length=300, blank=True)
    slug = models.SlugField(max_length=255, unique=True, editable=False)
    household = models.ForeignKey(
        Household,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name='recipes',
        help_text='Empty for a catalogue recipe.',
    )
    created_by = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='recipes_written',
        help_text='Who wrote it. Empty for a catalogue recipe.',
    )
    cuisines = models.ManyToManyField(Cuisine, related_name='recipes', blank=True)
    courses = models.ManyToManyField(Course, related_name='recipes', blank=True)
    difficulty = models.CharField(max_length=10, choices=Difficulty.choices, blank=True)
    prep_minutes = models.PositiveIntegerField(null=True, blank=True)
    cook_minutes = models.PositiveIntegerField(null=True, blank=True)
    extra_minutes = models.PositiveIntegerField(default=0, help_text='Waiting time, such as marinating or proving.')
    extra_label = models.CharField(
        max_length=50, blank=True, help_text='What the extra time is for, such as marinating, resting or proving.'
    )
    servings = models.PositiveSmallIntegerField(
        null=True, blank=True, validators=[MinValueValidator(1)], help_text='Leave empty when giving a yield.'
    )
    yield_amount = models.PositiveSmallIntegerField(
        null=True, blank=True, validators=[MinValueValidator(1)], help_text='"12" in "makes 12 cookies".'
    )
    yield_unit = models.CharField(max_length=50, blank=True, help_text='"cookies" in "makes 12 cookies".')
    equipment = models.ManyToManyField(Equipment, related_name='recipes', blank=True)
    one_pot = models.BooleanField('one-pot', default=False)
    source = models.CharField(
        'source credit',
        max_length=300,
        blank=True,
        help_text='Where the recipe came from: an author, a website or a book.',
    )
    source_url = models.URLField(
        'source address',
        max_length=500,
        blank=True,
        help_text="The original recipe's page, which the source credit links to. Leave empty when there is none.",
    )
    photo_url = models.URLField(
        'photo address',
        max_length=500,
        blank=True,
        validators=[
            RegexValidator(
                COMMONS_FILE,
                'Give the address of a JPEG, PNG or WebP file on Wikimedia Commons, '
                'starting https://upload.wikimedia.org/wikipedia/commons/.',
                # A code of its own, as the admin form swaps the default 'invalid' for "Enter a valid URL."
                code='not_commons_file',
            )
        ],
        help_text=(
            'On the photo\'s Wikimedia Commons page, copy the address of "Original file". '
            'Leave the photo empty to show the cuisine plate.'
        ),
    )
    photo_author = models.CharField('photo author', max_length=200, blank=True)
    photo_licence = models.CharField(
        'photo licence', max_length=50, blank=True, help_text='As Commons gives it, such as CC BY-SA 4.0.'
    )
    photo_source_url = models.URLField(
        'photo source',
        max_length=500,
        blank=True,
        validators=[
            RegexValidator(
                COMMONS_FILE_PAGE,
                "Give the photo's page on Wikimedia Commons, starting https://commons.wikimedia.org/wiki/File:.",
                code='not_commons_file_page',
            )
        ],
        help_text="The photo's page on Wikimedia Commons, starting https://commons.wikimedia.org/wiki/File:.",
    )

    objects = RecipeQuerySet.as_manager()

    class Meta:
        # The admin's full_clean checks these too, so a staff user sees the message instead of an error page.
        constraints = [
            models.CheckConstraint(
                condition=(
                    models.Q(servings__isnull=False, yield_amount__isnull=True, yield_unit='')
                    | models.Q(servings__isnull=True, yield_amount__isnull=False) & ~models.Q(yield_unit='')
                    | models.Q(servings__isnull=True, yield_amount__isnull=True, yield_unit='')
                ),
                name='recipe_servings_or_yield',
                violation_error_message='Give servings or a yield with its unit, not both.',
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(extra_minutes=0, extra_label='')
                    | models.Q(extra_minutes__gt=0) & ~models.Q(extra_label='')
                ),
                name='recipe_extra_time_has_label',
                violation_error_message='Give extra time with its label (marinating, resting, proving), or neither.',
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(photo_url='', photo_author='', photo_licence='', photo_source_url='')
                    | ~models.Q(photo_url='')
                    & ~models.Q(photo_author='')
                    & ~models.Q(photo_licence='')
                    & ~models.Q(photo_source_url='')
                ),
                name='recipe_photo_is_credited',
                violation_error_message='Give a photo with its author, licence and source, or none of them.',
            ),
            # The fields are optional for a household's recipe, so this keeps a catalogue file from leaving one out.
            models.CheckConstraint(
                condition=models.Q(household__isnull=False)
                | ~models.Q(difficulty='')
                & models.Q(prep_minutes__isnull=False, cook_minutes__isnull=False)
                & ~models.Q(source='')
                & (models.Q(servings__isnull=False) | models.Q(yield_amount__isnull=False)),
                name='recipe_catalogue_is_complete',
                violation_error_message=(
                    'A catalogue recipe needs a difficulty, prep and cook times, servings or a yield, '
                    'and a source credit.'
                ),
            ),
        ]

    def __str__(self) -> str:
        return self.title

    def save(self, **kwargs: Any) -> None:
        # Set once, so a recipe keeps its address when its title changes.
        if not self.slug:
            self.slug = Recipe.objects.unique_slug_for(self.title)
        super().save(**kwargs)

    @property
    def visibility(self) -> Visibility:
        # Every household recipe is private until it can be published (TAS-119).
        return Visibility.PUBLIC if self.household_id is None else Visibility.PRIVATE

    @property
    def total_minutes(self) -> int | None:
        if self.prep_minutes is None or self.cook_minutes is None:
            return None
        return self.prep_minutes + self.cook_minutes + self.extra_minutes

    @property
    def photo(self) -> Photo | None:
        if self.photo_url == '':
            return None
        return Photo(self.photo_url, self.photo_author, self.photo_licence, self.photo_source_url)


class IngredientQuerySet(models.QuerySet['Ingredient']):
    def named(self, text: str) -> IngredientQuerySet:
        """Ingredients whose name or any synonym contains the text, ignoring case and accents."""
        # A subquery, not a join, so an ingredient with two matching synonyms is listed once.
        synonyms = IngredientSynonym.objects.filter(name__unaccent__icontains=text)
        return self.filter(Q(name__unaccent__icontains=text) | Q(pk__in=synonyms.values('ingredient')))


class Ingredient(models.Model):
    name = models.CharField(max_length=100, unique=True, help_text='The UK name: courgette, coriander, plain flour.')
    slug = models.SlugField(max_length=100, unique=True)
    # What it contains, from which a recipe's diet tags are worked out.
    contains_meat = models.BooleanField('meat', default=False, help_text='Including gelatine, lard and meat stock.')
    contains_fish = models.BooleanField(
        'fish', default=False, help_text='Including shellfish, anchovies and fish sauce.'
    )
    contains_dairy = models.BooleanField('dairy', default=False, help_text='Milk, cream, butter, cheese, yoghurt.')
    contains_animal_rennet = models.BooleanField(
        'animal rennet', default=False, help_text='Cheese made with calf rennet, such as parmesan: not vegetarian.'
    )
    contains_egg = models.BooleanField('egg', default=False)
    contains_other_animal_product = models.BooleanField(
        'other animal product', default=False, help_text='Such as honey: vegetarian, but not vegan.'
    )
    contains_gluten = models.BooleanField(
        'gluten', default=False, help_text='Wheat, barley and rye, and oats not labelled gluten-free.'
    )
    grams_per_cup = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(1)],
        help_text='What a US cup of it weighs, from USDA FoodData Central. Only dry goods have one.',
    )
    CONTAINS = (
        'contains_meat',
        'contains_fish',
        'contains_dairy',
        'contains_animal_rennet',
        'contains_egg',
        'contains_other_animal_product',
        'contains_gluten',
    )

    objects = IngredientQuerySet.as_manager()

    class Meta:
        ordering = ['name']

    def __str__(self) -> str:
        return self.name


class IngredientSynonym(models.Model):
    ingredient = models.ForeignKey(Ingredient, on_delete=models.CASCADE, related_name='synonyms')
    # Unique across every ingredient, so a name means one ingredient wherever it's looked up.
    name = models.CharField(max_length=100, unique=True, help_text='Another name, such as the US one: zucchini.')

    class Meta:
        ordering = ['name']

    def __str__(self) -> str:
        return self.name


class DietTag(models.TextChoices):
    VEGETARIAN = 'vegetarian', 'Vegetarian'
    VEGAN = 'vegan', 'Vegan'
    GLUTEN_FREE = 'gluten_free', 'Gluten-free'
    DAIRY_FREE = 'dairy_free', 'Dairy-free'


# The ingredient flags that rule each diet tag out. services.diet_tags() and RecipeQuerySet.suiting() both read it.
RULED_OUT_BY: dict[DietTag, tuple[str, ...]] = {
    DietTag.VEGETARIAN: ('contains_meat', 'contains_fish', 'contains_animal_rennet'),
    DietTag.VEGAN: (
        'contains_meat',
        'contains_fish',
        'contains_dairy',
        'contains_animal_rennet',
        'contains_egg',
        'contains_other_animal_product',
    ),
    DietTag.GLUTEN_FREE: ('contains_gluten',),
    DietTag.DAIRY_FREE: ('contains_dairy',),
}


class Unit(models.TextChoices):
    GRAM = 'g', 'g'
    KILOGRAM = 'kg', 'kg'
    MILLILITRE = 'ml', 'ml'
    LITRE = 'l', 'l'
    TEASPOON = 'tsp', 'tsp'
    TABLESPOON = 'tbsp', 'tbsp'
    CUP = 'cup', 'cup'
    OUNCE = 'oz', 'oz'
    POUND = 'lb', 'lb'
    FLUID_OUNCE = 'fl_oz', 'fl oz'
    PINCH = 'pinch', 'pinch'
    CLOVE = 'clove', 'clove'
    TIN = 'tin', 'tin'
    SLICE = 'slice', 'slice'
    BUNCH = 'bunch', 'bunch'
    HANDFUL = 'handful', 'handful'


class IngredientGroup(models.Model):
    recipe = models.ForeignKey(Recipe, on_delete=models.CASCADE, related_name='ingredient_groups')
    name = models.CharField(max_length=100, help_text='"For the sauce", "To serve".')
    position = models.PositiveSmallIntegerField(default=0, help_text='Lower numbers come first.')

    class Meta:
        ordering = ['position', 'id']

    def __str__(self) -> str:
        return self.name


class IngredientLine(models.Model):
    recipe = models.ForeignKey(Recipe, on_delete=models.CASCADE, related_name='ingredient_lines')
    group = models.ForeignKey(
        IngredientGroup,
        # Deleting a group moves its lines above the groups rather than losing them.
        on_delete=models.SET_NULL,
        related_name='lines',
        null=True,
        blank=True,
        help_text='Leave empty for a line above every group. Save a new group before choosing it.',
    )
    position = models.PositiveSmallIntegerField(default=0, help_text='Lower numbers come first.')
    amount = models.DecimalField(
        max_digits=8, decimal_places=3, null=True, blank=True, help_text='Leave empty for "to taste".'
    )
    amount_max = models.DecimalField(
        'up to', max_digits=8, decimal_places=3, null=True, blank=True, help_text='"3" in a range of 2 to 3.'
    )
    unit = models.CharField(max_length=10, choices=Unit.choices, blank=True, help_text='Leave empty for "2 eggs".')
    ingredient = models.ForeignKey(Ingredient, on_delete=models.PROTECT, related_name='lines')
    note = models.CharField(max_length=200, blank=True, help_text='"finely chopped".')
    optional = models.BooleanField(default=False)
    original_text = models.CharField(
        'original wording', max_length=300, blank=True, help_text='The line as the recipe was written.'
    )

    class Meta:
        ordering = ['position', 'id']
        constraints = [
            models.CheckConstraint(
                condition=models.Q(amount__isnull=True) | models.Q(amount__gt=0),
                name='ingredientline_amount_positive',
                violation_error_message='Give an amount above 0, or leave it empty.',
            ),
            models.CheckConstraint(
                condition=models.Q(amount_max__isnull=True)
                | models.Q(amount__isnull=False, amount_max__gt=models.F('amount')),
                name='ingredientline_range_rises',
                violation_error_message='Give a range with its lower amount first, such as 2 up to 3.',
            ),
        ]

    def __str__(self) -> str:
        return self.original_text or self.ingredient.name


class Step(models.Model):
    recipe = models.ForeignKey(Recipe, on_delete=models.CASCADE, related_name='steps')
    position = models.PositiveSmallIntegerField(default=0, help_text='Lower numbers come first.')
    text = models.TextField()

    class Meta:
        ordering = ['position', 'id']

    def __str__(self) -> str:
        return self.text[:50]
