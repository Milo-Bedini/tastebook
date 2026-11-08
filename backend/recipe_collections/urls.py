from django.urls import path

from recipe_collections.views import (
    FavouritesSavedView,
    HouseholdListView,
    ListsView,
    PersonalListView,
    RecipeListsView,
    RestoreSavedView,
    SavedRecipeView,
)

urlpatterns = [
    path('', ListsView.as_view(), name='list-list'),
    path('favourites/saved/', FavouritesSavedView.as_view(), name='favourites-saved'),
    path('saved/restore/', RestoreSavedView.as_view(), name='saved-restore'),
    path('saved/<int:saved_id>/', SavedRecipeView.as_view(), name='saved-recipe'),
    # Two parts, so no personal list's address (one part) reaches it.
    path('recipes/<slug:slug>/', RecipeListsView.as_view(), name='recipe-lists'),
    path('household/<slug:slug>/', HouseholdListView.as_view(), name='household-list'),
    path('<slug:slug>/', PersonalListView.as_view(), name='personal-list'),
]
