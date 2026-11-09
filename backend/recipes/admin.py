from datetime import datetime
from typing import Any

from django.contrib import admin, messages
from django.db.models import Count, Field, Max, Model, Q, QuerySet
from django.forms import BaseInlineFormSet, ChoiceField, ModelForm
from django.http import HttpRequest
from django.utils.html import format_html

from recipes.models import (
    Cuisine,
    Equipment,
    Ingredient,
    IngredientGroup,
    IngredientLine,
    IngredientStatus,
    IngredientSynonym,
    Moderation,
    Recipe,
    Report,
    ReportedRecipe,
    Step,
)
from recipes.services import StaffDecision, review_reports


@admin.register(Cuisine)
class CuisineAdmin(admin.ModelAdmin):
    list_display = ('name', 'slug')
    prepopulated_fields = {'slug': ('name',)}


class ReadOnly:
    """Viewable only: every deploy's load_catalogue makes the catalogue what catalogue.json says, undoing any edit."""

    def has_add_permission(self, request: HttpRequest, obj: Model | None = None) -> bool:
        return False

    def has_change_permission(self, request: HttpRequest, obj: Model | None = None) -> bool:
        return False

    def has_delete_permission(self, request: HttpRequest, obj: Model | None = None) -> bool:
        return False


class CatalogueAdmin(ReadOnly, admin.ModelAdmin):
    change_list_template = 'admin/recipes/catalogue_change_list.html'
    change_form_template = 'admin/recipes/catalogue_change_form.html'


class CatalogueInline(ReadOnly, admin.TabularInline):
    pass


@admin.register(Equipment)
class EquipmentAdmin(CatalogueAdmin):
    list_display = ('name', 'slug')
    prepopulated_fields = {'slug': ('name',)}


class IngredientSynonymInline(CatalogueInline):
    model = IngredientSynonym
    fields = ('name',)
    extra = 0


def _added(ingredient: Ingredient | None) -> bool:
    return ingredient is not None and ingredient.status != IngredientStatus.CATALOGUE


@admin.register(Ingredient)
class IngredientAdmin(admin.ModelAdmin):
    """Catalogue ingredients are read-only, as CatalogueAdmin's are; staff review and change the ones people added."""

    change_list_template = 'admin/recipes/ingredient_change_list.html'
    change_form_template = 'admin/recipes/ingredient_change_form.html'
    list_display = ('name', 'slug', 'status', *Ingredient.CONTAINS)
    list_filter = ('status', *Ingredient.CONTAINS)
    # Synonyms too, so the ingredient picker on a recipe line finds courgette by "zucchini".
    search_fields = ('name', 'synonyms__name')
    readonly_fields = ('slug',)
    fieldsets = (
        (None, {'fields': ('name', 'slug', 'status')}),
        ('Contains', {'fields': Ingredient.CONTAINS, 'description': "A recipe's diet tags are worked out from these."}),
        ('Measures', {'fields': ('grams_per_cup',)}),
    )
    inlines = (IngredientSynonymInline,)

    def has_add_permission(self, request: HttpRequest) -> bool:
        return False

    def has_change_permission(self, request: HttpRequest, obj: Ingredient | None = None) -> bool:
        return _added(obj) and super().has_change_permission(request, obj)

    def has_delete_permission(self, request: HttpRequest, obj: Ingredient | None = None) -> bool:
        return _added(obj) and super().has_delete_permission(request, obj)

    def formfield_for_choice_field(self, db_field: Field[Any, Any], request: HttpRequest, **kwargs: Any) -> ChoiceField:
        # An added ingredient can't become a catalogue one here; only the catalogue load makes those.
        if db_field.name == 'status':
            kwargs['choices'] = [
                (IngredientStatus.AWAITING_REVIEW.value, IngredientStatus.AWAITING_REVIEW.label),
                (IngredientStatus.REVIEWED.value, IngredientStatus.REVIEWED.label),
            ]
        return super().formfield_for_choice_field(db_field, request, **kwargs)


class IngredientGroupInline(CatalogueInline):
    model = IngredientGroup
    fields = ('position', 'name')
    extra = 0


class IngredientLineFormSet(BaseInlineFormSet):
    def add_fields(self, form: ModelForm, index: int | None) -> None:
        super().add_fields(form, index)
        # Django can't nest a group's lines inside it, so each line picks from its own recipe's groups only.
        groups = IngredientGroup.objects.none()
        if self.instance.pk is not None:
            groups = IngredientGroup.objects.filter(recipe=self.instance)
        form.fields['group'].queryset = groups


class IngredientLineInline(CatalogueInline):
    model = IngredientLine
    formset = IngredientLineFormSet
    fields = ('position', 'group', 'amount', 'amount_max', 'unit', 'ingredient', 'note', 'optional', 'original_text')
    autocomplete_fields = ('ingredient',)
    extra = 0


class StepInline(CatalogueInline):
    model = Step
    fields = ('position', 'text')
    extra = 0


@admin.register(Recipe)
class RecipeAdmin(CatalogueAdmin):
    list_display = ('title', 'description')
    readonly_fields = ('slug',)
    filter_horizontal = ('cuisines', 'courses', 'equipment')
    fieldsets = (
        (None, {'fields': ('title', 'slug', 'description', 'cuisines', 'courses', 'difficulty', 'one_pot')}),
        ('Time', {'fields': ('prep_minutes', 'cook_minutes', 'extra_minutes', 'extra_label')}),
        ('Servings or yield', {'fields': ('servings', 'yield_amount', 'yield_unit')}),
        (None, {'fields': ('equipment', 'source', 'source_url')}),
        ('Photo', {'fields': ('photo_url', 'photo_author', 'photo_licence', 'photo_source_url')}),
    )
    inlines = (IngredientGroupInline, IngredientLineInline, StepInline)

    def get_queryset(self, request: HttpRequest) -> QuerySet[Recipe]:
        # Households' recipes aren't the catalogue's, and staff have no need to read them.
        return super().get_queryset(request).filter(household__isnull=True)


class ReportInline(ReadOnly, admin.TabularInline):
    model = Report
    fields = ('reason', 'note', 'reporter', 'created_at', 'reviewed_at')
    readonly_fields = fields
    extra = 0


@admin.register(ReportedRecipe)
class ReportedRecipeAdmin(ReadOnly, admin.ModelAdmin):
    """Household recipes someone has reported. Staff read each one here, since a hidden recipe's page is its author's
    alone, and restore or remove it from the list; neither changes what its household wrote."""

    list_display = ('title', 'awaiting', 'moderation', 'visibility', 'last_reported', 'household', 'author')
    list_select_related = ('household', 'created_by')
    # The slug too, so a recipe's address finds it.
    search_fields = ('title', 'slug')
    actions = ('restore', 'remove')
    fieldsets = (
        (None, {'fields': ('title', 'household', 'author', 'visibility', 'moderation')}),
        ('Recipe', {'fields': ('description', 'photo', 'source', 'source_url')}),
    )
    readonly_fields = ('author', 'photo')
    inlines = (ReportInline, IngredientGroupInline, IngredientLineInline, StepInline)

    def get_ordering(self, request: HttpRequest) -> list[str]:
        # Those awaiting review first. Not `ordering`: the admin's checks refuse a name that isn't the model's field.
        # No list_filter either: Django's filter links are smaller than WCAG 2.5.8's 24px targets.
        return ['-awaiting_review', '-last_reported_at']

    def get_queryset(self, request: HttpRequest) -> QuerySet[ReportedRecipe]:
        # Not super(), which orders by get_ordering() before the annotation it names exists.
        return ReportedRecipe.objects.filter(household__isnull=False, reports__isnull=False).annotate(
            awaiting_review=Count('reports', filter=Q(reports__reviewed_at__isnull=True)),
            last_reported_at=Max('reports__created_at'),
        )

    @admin.display(description='Awaiting review', ordering='awaiting_review')
    def awaiting(self, recipe: ReportedRecipe) -> int:
        return recipe.awaiting_review

    @admin.display(description='Last reported', ordering='last_reported_at')
    def last_reported(self, recipe: ReportedRecipe) -> datetime:
        return recipe.last_reported_at

    @admin.display(description='Author', ordering='created_by__name')
    def author(self, recipe: ReportedRecipe) -> str:
        return '-' if recipe.created_by is None else f'{recipe.created_by.name} ({recipe.created_by.email})'

    @admin.display(description='Photo')
    def photo(self, recipe: ReportedRecipe) -> str:
        if not recipe.photo_url:
            return '-'
        return format_html('<img src="{}" alt="The recipe\'s photo" width="320">', recipe.photo_url)

    def _review(self, request: HttpRequest, chosen: QuerySet[ReportedRecipe], decision: StaffDecision) -> None:
        reviewed = [recipe.title for recipe in chosen if review_reports(recipe, decision)]
        done = 'Restored' if decision == Moderation.RESTORED else 'Removed'
        if reviewed:
            self.message_user(request, f'{done} {", ".join(reviewed)}.')
        unchanged = len(chosen) - len(reviewed)
        if unchanged:
            self.message_user(
                request, f'{unchanged} had no reports awaiting review, so nothing changed.', messages.WARNING
            )

    @admin.action(description='Restore: show to everyone again, and tell the author')
    def restore(self, request: HttpRequest, chosen: QuerySet[ReportedRecipe]) -> None:
        self._review(request, chosen, Moderation.RESTORED)

    @admin.action(description='Remove: make private for good, and tell the author')
    def remove(self, request: HttpRequest, chosen: QuerySet[ReportedRecipe]) -> None:
        self._review(request, chosen, Moderation.REMOVED)
