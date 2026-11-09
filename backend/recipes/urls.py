from django.urls import path

from recipes.views import (
    RecipeCopyView,
    RecipeDetailView,
    RecipeListView,
    RecipeReportView,
    RecipeShareLinkView,
    RecipeVisibilityView,
)

urlpatterns = [
    path('', RecipeListView.as_view(), name='recipe-list'),
    path('<slug:slug>/', RecipeDetailView.as_view(), name='recipe-detail'),
    path('<slug:slug>/copy/', RecipeCopyView.as_view(), name='recipe-copy'),
    path('<slug:slug>/report/', RecipeReportView.as_view(), name='recipe-report'),
    path('<slug:slug>/share-link/', RecipeShareLinkView.as_view(), name='recipe-share-link'),
    path('<slug:slug>/visibility/', RecipeVisibilityView.as_view(), name='recipe-visibility'),
]
