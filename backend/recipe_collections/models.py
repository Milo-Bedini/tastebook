from typing import Any

from django.db import models
from django.db.models.functions import Lower
from django.dispatch import receiver
from django.utils import timezone

from households.models import Household, User
from households.signals import counting_household_lists, household_emptied, member_moved
from recipes.models import Recipe
from recipes.signals import counting_saves

LIST_NAME_MAX_LENGTH = 60


class Scope(models.TextChoices):
    PERSONAL = 'personal', 'Just you'
    HOUSEHOLD = 'household', 'Household'


class RecipeList(models.Model):
    # A personal list, Favourites among them, has an owner; a household's list has a household, and stays with it
    # whoever made it.
    owner = models.ForeignKey(User, null=True, blank=True, on_delete=models.CASCADE, related_name='recipe_lists')
    household = models.ForeignKey(
        Household, null=True, blank=True, on_delete=models.CASCADE, related_name='recipe_lists'
    )
    # The list every account has, made when it first saves; nothing renames or deletes it.
    favourites = models.BooleanField(default=False)
    name = models.CharField(max_length=LIST_NAME_MAX_LENGTH)
    # Its address, unique among the owner's lists or the household's, so a personal and a household list may share it.
    slug = models.SlugField(max_length=LIST_NAME_MAX_LENGTH + 10, db_index=False)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['owner'], condition=models.Q(favourites=True), name='one_favourites_per_account'
            ),
            models.CheckConstraint(
                condition=models.Q(owner__isnull=False, household__isnull=True)
                | models.Q(owner__isnull=True, household__isnull=False, favourites=False),
                name='list_is_personal_or_household',
            ),
            models.UniqueConstraint(
                fields=['owner', 'slug'], condition=models.Q(owner__isnull=False), name='personal_list_slug_once'
            ),
            models.UniqueConstraint(
                fields=['household', 'slug'],
                condition=models.Q(household__isnull=False),
                name='household_list_slug_once',
            ),
            models.UniqueConstraint(
                Lower('name'), 'owner', condition=models.Q(owner__isnull=False), name='personal_list_name_once'
            ),
            models.UniqueConstraint(
                Lower('name'), 'household', condition=models.Q(household__isnull=False), name='household_list_name_once'
            ),
        ]

    def __str__(self) -> str:
        return self.name

    @property
    def scope(self) -> Scope:
        return Scope.PERSONAL if self.owner_id is not None else Scope.HOUSEHOLD


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
    """Everyone but `excluding` with the recipe in a list they see: its owner's, or every member's of a household's."""
    lists = RecipeList.objects.filter(saved_recipes__recipe=recipe)
    return (
        User.objects.filter(models.Q(pk__in=lists.values('owner')) | models.Q(household__in=lists.values('household')))
        .exclude(pk=excluding.pk)
        .count()
    )


# Households sends this and depends on no other area, so what a move does to an account's own lists is done here.
@receiver(member_moved, dispatch_uid='collections-drop-unseen-saves')
def drop_unseen_saves(sender: type[User], account: User, left: int, **kwargs: Any) -> None:
    """Takes the household it left's private recipes, which it no longer sees, out of the account's own lists. Its
    household lists stay with that household."""
    SavedRecipe.objects.filter(recipe_list__owner=account, recipe__household_id=left).exclude(
        recipe__in=Recipe.objects.visible_to(account)
    ).delete()


@receiver(household_emptied, dispatch_uid='collections-drop-household-lists')
def drop_household_lists(sender: type[Household], household_id: int, **kwargs: Any) -> None:
    """A household nobody is left in keeps no lists, as nobody is left to see them."""
    RecipeList.objects.filter(household_id=household_id).delete()


@receiver(counting_household_lists, dispatch_uid='collections-count-household-lists')
def count_household_lists(sender: type[Household], household_id: int, **kwargs: Any) -> int:
    return RecipeList.objects.filter(household_id=household_id).count()
