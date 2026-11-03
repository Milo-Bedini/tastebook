from django.contrib import admin
from django.db.models import Model, QuerySet
from django.forms import BaseInlineFormSet, ModelForm
from django.http import HttpRequest

from recipes.models import (
    Cuisine,
    Equipment,
    Ingredient,
    IngredientGroup,
    IngredientLine,
    IngredientSynonym,
    Recipe,
    Step,
)


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


@admin.register(Ingredient)
class IngredientAdmin(CatalogueAdmin):
    list_display = ('name', 'slug', *Ingredient.CONTAINS)
    list_filter = Ingredient.CONTAINS
    # Synonyms too, so the ingredient picker on a recipe line finds courgette by "zucchini".
    search_fields = ('name', 'synonyms__name')
    prepopulated_fields = {'slug': ('name',)}
    fieldsets = (
        (None, {'fields': ('name', 'slug')}),
        ('Contains', {'fields': Ingredient.CONTAINS, 'description': "A recipe's diet tags are worked out from these."}),
    )
    inlines = (IngredientSynonymInline,)


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
