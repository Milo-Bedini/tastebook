from django.urls import path

from seed.views import SeedView

urlpatterns = [
    path('', SeedView.as_view(), name='test-account-seed'),
]
