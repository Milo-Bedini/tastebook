from django.urls import path

from recipes.views import RecipeCopyView, RecipeDetailView, RecipeListView, RecipeVisibilityView

urlpatterns = [
    path('', RecipeListView.as_view(), name='recipe-list'),
    path('<slug:slug>/', RecipeDetailView.as_view(), name='recipe-detail'),
    path('<slug:slug>/copy/', RecipeCopyView.as_view(), name='recipe-copy'),
    path('<slug:slug>/visibility/', RecipeVisibilityView.as_view(), name='recipe-visibility'),
]
