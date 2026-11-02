from allauth.headless.constants import Client
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from households.views import (
    ConfirmSignInCodeView,
    CurrentAccountView,
    HouseholdMemberView,
    HouseholdView,
    LeaveHouseholdView,
    RequestSignInCodeView,
    SignUpView,
    VerifyEmailCodeView,
)
from recipes.views import CourseListView, CuisineListView, IngredientListView

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/health/', include('health.urls')),
    path('api/account/', CurrentAccountView.as_view(), name='current-account'),
    path('api/household/', HouseholdView.as_view(), name='household'),
    path('api/household/leave/', LeaveHouseholdView.as_view(), name='household-leave'),
    path('api/household/members/<int:member_id>/', HouseholdMemberView.as_view(), name='household-member'),
    path('api/test-accounts/', include('households.urls')),
    # Ours first, so they answer on allauth's own paths: see households.views.
    path('api/_allauth/browser/v1/auth/code/request', RequestSignInCodeView.as_api_view(client=Client.BROWSER)),
    path('api/_allauth/browser/v1/auth/code/confirm', ConfirmSignInCodeView.as_api_view(client=Client.BROWSER)),
    path('api/_allauth/browser/v1/auth/signup', SignUpView.as_api_view(client=Client.BROWSER)),
    path('api/_allauth/browser/v1/auth/email/verify', VerifyEmailCodeView.as_api_view(client=Client.BROWSER)),
    path('api/_allauth/', include('allauth.headless.urls')),
    # Under HEADLESS_ONLY this is only the providers' own URLs: Google's client redirects to its callback here.
    path('api/accounts/', include('allauth.urls')),
    path('api/recipes/', include('recipes.urls')),
    path('api/cuisines/', CuisineListView.as_view(), name='cuisine-list'),
    path('api/courses/', CourseListView.as_view(), name='course-list'),
    path('api/ingredients/', IngredientListView.as_view(), name='ingredient-list'),
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/schema/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='schema-docs'),
]
