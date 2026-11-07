from typing import Any

from django.db import models
from django.dispatch import receiver
from django.utils import timezone

from households.models import User
from recipes.models import Recipe
from recipes.signals import counting_saves


class RecipeList(models.Model):
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name='recipe_lists')
    # The list every account has, made when it first saves; nothing renames or deletes it.
    favourites = models.BooleanField(default=False)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['owner'], condition=models.Q(favourites=True), name='one_favourites_per_account'
            ),
        ]

    def __str__(self) -> str:
        return f'Favourites of {self.owner_id}' if self.favourites else f'List {self.pk}'


class SavedRecipeQuerySet(models.QuerySet['SavedRecipe']):
    def in_favourites_of(self, account: User) -> SavedRecipeQuerySet:
        return self.filter(recipe_list__owner=account, recipe_list__favourites=True)

    def newest_first(self) -> SavedRecipeQuerySet:
        return self.order_by('-saved_at', '-pk')


class SavedRecipe(models.Model):
    recipe_list = models.ForeignKey(RecipeList, on_delete=models.CASCADE, related_name='saved_recipes')
    # A link, never a copy, so the list shows the author's changes. Emptied when the recipe is deleted, so its place
    # stays, unavailable.
    recipe = models.ForeignKey(Recipe, null=True, on_delete=models.SET_NULL, related_name='+')
    # The title it was saved with, which the list still shows once the recipe is unavailable.
    title = models.CharField(max_length=200)
    saved_at = models.DateTimeField(default=timezone.now)

    objects = SavedRecipeQuerySet.as_manager()

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['recipe_list', 'recipe'], name='saved_once_per_list'),
        ]

    def __str__(self) -> str:
        return self.title


@receiver(counting_saves, dispatch_uid='collections-count-saves')
def count_saves(sender: type[Recipe], recipe: Recipe, excluding: User, **kwargs: Any) -> int:
    return (
        SavedRecipe.objects.filter(recipe=recipe)
        .exclude(recipe_list__owner=excluding)
        .values('recipe_list__owner')
        .distinct()
        .count()
    )
