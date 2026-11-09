import secrets
from functools import reduce
from operator import or_
from typing import Any

from django.contrib.auth.models import AnonymousUser
from django.core.validators import MinValueValidator, RegexValidator
from django.db import models
from django.db.models import Case, F, Q, Value, When
from django.db.models.functions import Lower
from django.dispatch import receiver
from django.utils.text import slugify

from households.models import Household, User
from households.signals import counting_recipes_to_copy, member_moved
from recipes.photos import COMMONS_FILE_PAGE, COMMONS_HOST, Photo, validate_photo_address
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


class Moderation(models.TextChoices):
    UNREPORTED = 'unreported', 'Not reported'
    HIDDEN = 'hidden', 'Hidden while a report is reviewed'
    RESTORED = 'restored', 'Restored by staff'


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
        unchecked = IngredientLine.objects.filter(ingredient__status=IngredientStatus.AWAITING_REVIEW)
        # A recipe with no required line claims no diet, as diet_tags() says.
        return (
            self.filter(pk__in=required.values('recipe'))
            .exclude(pk__in=ruled_out.values('recipe'))
            .exclude(pk__in=unchecked.values('recipe'))
        )

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

    def written_by_in(self, author: User, household_id: int) -> RecipeQuerySet:
        return self.filter(household_id=household_id, created_by=author)

    def copy_into(self, household_id: int, copier: User | None = None) -> list[Recipe]:
        """Copies each recipe into the household with its ingredients, steps, cuisines, courses and equipment, so
        changing either one leaves the other alone. With a copier, each is a private Copy: written by them and linked to
        its original, and a copy of a catalogue recipe keeps the original's source credit as its own read-only one.
        Without one, each keeps its author and visibility and links to nothing new, as a moving member's
        recipes do."""
        originals = list(
            self.prefetch_related('cuisines', 'courses', 'equipment', 'ingredient_groups', 'ingredient_lines', 'steps')
        )

        def made_by_copier(original: Recipe) -> dict[str, Any]:
            if copier is None:
                return {}
            made = {
                'created_by_id': copier.pk,
                'visibility': Visibility.PRIVATE,
                'adapted_from_id': original.pk,
                'is_copy': True,
            }
            if original.household_id is not None:
                return made
            # A catalogue recipe's credit carries its licence, so it moves where editing the Copy can't remove it.
            return {
                **made,
                'original_source': original.source,
                'original_source_url': original.source_url,
                'source': '',
                'source_url': '',
            }

        # A few queries however many recipes there are, besides one per recipe to find a free slug.
        copies = Recipe.objects.bulk_create(
            [
                _copied(
                    original,
                    household_id=household_id,
                    slug=Recipe.objects.private_slug_for(original.title),
                    # A new recipe, so its original's reports and staff's review of them stay with the original.
                    moderation=Moderation.UNREPORTED,
                    **made_by_copier(original),
                )
                for original in originals
            ]
        )
        pairs = list(zip(originals, copies, strict=True))
        for field_name in ['cuisines', 'courses', 'equipment']:
            _copy_links(pairs, field_name)
        groups = [
            (group, _copied(group, recipe_id=copy.pk))
            for original, copy in pairs
            for group in original.ingredient_groups.all()
        ]
        IngredientGroup.objects.bulk_create([group for _, group in groups])
        group_ids = {original.pk: group.pk for original, group in groups}
        IngredientLine.objects.bulk_create(
            [
                _copied(line, recipe_id=copy.pk, group_id=group_ids.get(line.group_id))
                for original, copy in pairs
                for line in original.ingredient_lines.all()
            ]
        )
        Step.objects.bulk_create(
            [_copied(step, recipe_id=copy.pk) for original, copy in pairs for step in original.steps.all()]
        )
        return copies

    def public(self) -> RecipeQuerySet:
        return self.filter(visibility=Visibility.PUBLIC)

    def private(self) -> RecipeQuerySet:
        return self.filter(visibility=Visibility.PRIVATE)

    def visible_to(self, user: User | AnonymousUser) -> RecipeQuerySet:
        """Public recipes, and the recipes of the user's household when they're signed in to one. A recipe hidden while
        a report is reviewed is its author's alone."""
        if not user.is_authenticated:
            return self.public().exclude(moderation=Moderation.HIDDEN)
        shown = ~Q(moderation=Moderation.HIDDEN) | Q(created_by=user)
        if user.household_id is None:
            return self.public().filter(shown)
        return self.filter(Q(visibility=Visibility.PUBLIC) | Q(household_id=user.household_id)).filter(shown)

    def reportable_by(self, user: User | AnonymousUser) -> RecipeQuerySet:
        """The recipes an account may report: the public household recipes it can see, other households' only."""
        if not user.is_authenticated:
            return self.none()
        reportable = self.visible_to(user).public().filter(household__isnull=False)
        if user.household_id is None:
            return reportable
        return reportable.exclude(household_id=user.household_id)

    def editable_by(self, user: User | AnonymousUser) -> RecipeQuerySet:
        """The recipes an account may edit: its household's private recipes, whoever wrote them, and the public ones
        it wrote."""
        # filter(household_id=None) would match the catalogue's recipes.
        household_id = user.household_id if user.is_authenticated else None
        if household_id is None:
            return self.none()
        return self.filter(household_id=household_id).filter(Q(visibility=Visibility.PRIVATE) | Q(created_by=user))

    def publishable_by(self, user: User | AnonymousUser) -> RecipeQuerySet:
        """The recipes an account may make public or private: those of its household it wrote. A catalogue recipe has
        no household, so nobody may."""
        household_id = user.household_id if user.is_authenticated else None
        if household_id is None:
            return self.none()
        return self.written_by_in(user, household_id)

    def deletable_by(self, user: User | AnonymousUser) -> RecipeQuerySet:
        """The recipes an account may delete: those of its household it wrote, and those whose author has left it.
        A catalogue recipe has no household, so nobody may."""
        household_id = user.household_id if user.is_authenticated else None
        if household_id is None:
            return self.none()
        # A deleted account leaves created_by empty; one that moved has another household (or, briefly, none).
        author_gone = Q(created_by__isnull=True) | ~Q(created_by__household_id=household_id)
        return self.filter(household_id=household_id).filter(Q(created_by=user) | author_gone)


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
    visibility = models.CharField(
        max_length=7,
        choices=Visibility.choices,
        default=Visibility.PRIVATE,
        help_text='A catalogue recipe is always public; a household recipe is private until its author publishes it.',
    )
    moderation = models.CharField(
        max_length=10,
        choices=Moderation.choices,
        default=Moderation.UNREPORTED,
        editable=False,
        help_text="A recipe's first report hides it from everyone but its author until staff review it. Once staff "
        'restore it, later reports reach staff without hiding it.',
    )
    adapted_from = models.ForeignKey(
        'self',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='copies',
        help_text='The recipe this is a copy of. Empty for a recipe that is no copy, or whose original was deleted.',
    )
    is_copy = models.BooleanField(
        'copy',
        default=False,
        editable=False,
        help_text='Whether this was made as a Copy, which it stays once its original is deleted.',
    )
    original_source = models.CharField(
        "original's source credit",
        max_length=300,
        blank=True,
        editable=False,
        help_text="A catalogue original's source credit, which a Copy keeps where editing can't reach it, so the "
        "original's licence stays credited.",
    )
    original_source_url = models.URLField(
        "original's source address",
        max_length=500,
        blank=True,
        editable=False,
        help_text="The page the original's source credit links to.",
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
        validators=[validate_photo_address],
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
            # A Commons photo carries the credit its licence asks for; a photo a household uploads has none.
            models.CheckConstraint(
                condition=(
                    models.Q(photo_url='', photo_author='', photo_licence='', photo_source_url='')
                    | models.Q(photo_url__startswith=COMMONS_HOST)
                    & ~models.Q(photo_author='')
                    & ~models.Q(photo_licence='')
                    & ~models.Q(photo_source_url='')
                    | ~models.Q(photo_url='')
                    & ~models.Q(photo_url__startswith=COMMONS_HOST)
                    & models.Q(photo_author='', photo_licence='', photo_source_url='')
                ),
                name='recipe_photo_is_credited',
                violation_error_message=(
                    'Give a Wikimedia Commons photo with its author, licence and source, '
                    'and an uploaded photo with none of them.'
                ),
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
            models.CheckConstraint(
                condition=models.Q(household__isnull=False) | models.Q(visibility=Visibility.PUBLIC),
                name='recipe_catalogue_is_public',
                violation_error_message='A catalogue recipe is always public.',
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
    def total_minutes(self) -> int | None:
        if self.prep_minutes is None or self.cook_minutes is None:
            return None
        return self.prep_minutes + self.cook_minutes + self.extra_minutes

    @property
    def photo(self) -> Photo | None:
        if self.photo_url == '':
            return None
        return Photo(self.photo_url, self.photo_author, self.photo_licence, self.photo_source_url)


def new_share_token() -> str:
    return secrets.token_urlsafe(32)


class ShareLink(models.Model):
    """A read-only link to a private recipe, for anyone its author sends it to. Turning it off deletes it, so turning
    it on again makes a new token."""

    recipe = models.OneToOneField(Recipe, on_delete=models.CASCADE, related_name='share_link')
    token = models.CharField(max_length=43, unique=True, default=new_share_token, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f'Share link to {self.recipe_id}'


class ReportReason(models.TextChoices):
    SPAM = 'spam', 'Spam'
    OFFENSIVE = 'offensive', 'Offensive'
    COPIED = 'copied', 'Copied without credit'
    OTHER = 'other', 'Something else'


REPORT_NOTE_MAX_LENGTH = 500


class Report(models.Model):
    """Someone flagging another household's public recipe for staff to review."""

    recipe = models.ForeignKey(Recipe, on_delete=models.CASCADE, related_name='reports')
    reporter = models.ForeignKey(
        User,
        null=True,
        blank=True,
        # The report stays for staff when its reporter deletes their account, naming no one.
        on_delete=models.SET_NULL,
        related_name='reports_made',
    )
    reason = models.CharField(max_length=10, choices=ReportReason.choices)
    note = models.CharField(max_length=REPORT_NOTE_MAX_LENGTH, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at', 'id']
        constraints = [
            models.UniqueConstraint(fields=['recipe', 'reporter'], name='report_one_per_reporter'),
        ]

    def __str__(self) -> str:
        return f'Report of {self.recipe_id}: {self.get_reason_display()}'


class IngredientStatus(models.TextChoices):
    CATALOGUE = 'catalogue', 'From the catalogue'
    AWAITING_REVIEW = 'awaiting_review', 'Awaiting review'
    REVIEWED = 'reviewed', 'Reviewed'


class IngredientQuerySet(models.QuerySet['Ingredient']):
    def named(self, text: str) -> IngredientQuerySet:
        """Ingredients whose name or any synonym contains the text, ignoring case and accents."""
        # A subquery, not a join, so an ingredient with two matching synonyms is listed once.
        synonyms = IngredientSynonym.objects.filter(name__unaccent__icontains=text)
        return self.filter(Q(name__unaccent__icontains=text) | Q(pk__in=synonyms.values('ingredient')))

    def called(self, name: str) -> Ingredient | None:
        """The ingredient with this name or synonym, ignoring case and accents."""
        synonyms = IngredientSynonym.objects.filter(name__unaccent__iexact=name)
        return self.filter(Q(name__unaccent__iexact=name) | Q(pk__in=synonyms.values('ingredient'))).first()

    def offered_to(self, user: User | AnonymousUser) -> IngredientQuerySet:
        """Every ingredient but those awaiting review, which only households whose recipes use them are offered."""
        checked = ~Q(status=IngredientStatus.AWAITING_REVIEW)
        household_id = user.household_id if user.is_authenticated else None
        if household_id is None:
            return self.filter(checked)
        used = IngredientLine.objects.filter(recipe__household_id=household_id).values('ingredient')
        return self.filter(checked | Q(pk__in=used))

    def unique_slug_for(self, name: str) -> str:
        # Cut short so a "-2" still fits the field's 100 characters.
        base = (slugify(name) or 'ingredient')[:90].strip('-')
        taken = set(self.filter(slug__startswith=base).values_list('slug', flat=True))
        return first_free_slug(base, taken)


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
    status = models.CharField(
        max_length=20,
        choices=IngredientStatus.choices,
        default=IngredientStatus.CATALOGUE,
        help_text='Someone added it from a recipe unless it comes from the catalogue. '
        'Until it is reviewed, recipes using it show no diet tags.',
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

    @property
    def awaiting_review(self) -> bool:
        return self.status == IngredientStatus.AWAITING_REVIEW


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
# Neither claims a diet for a recipe using an ingredient awaiting review.
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


def _copied[M: models.Model](row: M, **changes: Any) -> M:
    """A new, unsaved row holding the row's values but for the changes, which are named by attname."""
    values = {
        field.attname: getattr(row, field.attname) for field in row._meta.concrete_fields if not field.primary_key
    }
    return type(row)(**{**values, **changes})


def _copy_links(pairs: list[tuple[Recipe, Recipe]], field_name: str) -> None:
    """Gives each copy the rows its original has through a many-to-many field."""
    field = Recipe._meta.get_field(field_name)
    assert isinstance(field, models.ManyToManyField)
    through = field.remote_field.through
    source, target = f'{field.m2m_field_name()}_id', f'{field.m2m_reverse_field_name()}_id'
    through.objects.bulk_create(
        [
            through(**{source: copy.pk, target: row.pk})
            for original, copy in pairs
            for row in getattr(original, field_name).all()
        ]
    )


# The households area sends these and depends on no other, so the recipes it moves an account away from are copied here.
@receiver(member_moved, dispatch_uid='recipes-take-written-recipes')
def take_recipes_written(sender: type[User], account: User, left: int, **kwargs: Any) -> None:
    """Moves each public recipe an account wrote in the household it left into its new one, and gives it a copy of
    each private one, which the household it left keeps."""
    written = Recipe.objects.written_by_in(account, left)
    # One public recipe, still its author's to edit, rather than a stranded original and a duplicate.
    written.public().update(household_id=account.household_id)
    # The original stays behind where its author can no longer turn its link off, so the link stops; the copy has none.
    ShareLink.objects.filter(recipe__in=written.private()).delete()
    written.private().copy_into(account.household_id)


@receiver(counting_recipes_to_copy, dispatch_uid='recipes-count-written-recipes')
def count_recipes_written(sender: type[User], account: User, **kwargs: Any) -> int:
    return Recipe.objects.written_by_in(account, account.household_id).private().count()
