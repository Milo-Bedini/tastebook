from django.urls import path

from recipe_collections.views import FavouritesSavedView, FavouritesView, ListsView, RestoreSavedView, SavedRecipeView

urlpatterns = [
    path('', ListsView.as_view(), name='list-list'),
    path('favourites/', FavouritesView.as_view(), name='favourites'),
    path('favourites/saved/', FavouritesSavedView.as_view(), name='favourites-saved'),
    path('favourites/saved/restore/', RestoreSavedView.as_view(), name='favourites-saved-restore'),
    path('favourites/saved/<int:saved_id>/', SavedRecipeView.as_view(), name='favourites-saved-recipe'),
]
