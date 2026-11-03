from django.conf import settings
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from households.services import may_use_test_accounts
from recipes.services import CatalogueError
from seed.serializers import SeededSerializer, SeedSerializer
from seed.services import seed


class SeedView(APIView):
    authentication_classes = []
    permission_classes = []

    @extend_schema(
        operation_id='test_account_seed_create',
        request=SeedSerializer,
        responses={
            201: SeededSerializer,
            400: OpenApiResponse(
                description='A field, a repeated key, or a recipe the database cannot hold; nothing is saved.'
            ),
            404: None,
        },
        description='Makes test accounts at tastebook.test in new households, with the private recipes each wrote, '
        'and answers a signed-in session for each. Local runs and previews only; 404 on production.',
    )
    def post(self, request: Request) -> Response:
        if not may_use_test_accounts(request.headers):
            raise NotFound
        given = SeedSerializer(data=request.data)
        given.is_valid(raise_exception=True)
        try:
            accounts = seed(given.validated_data['households'])
        except CatalogueError as error:
            raise ValidationError(str(error)) from error
        seeded = {'session_cookie': settings.SESSION_COOKIE_NAME, 'accounts': accounts}
        return Response(SeededSerializer(seeded).data, status=status.HTTP_201_CREATED)
