from collections import Counter
from typing import Any

from rest_framework import serializers

from households.models import HOUSEHOLD_NAME_MAX_LENGTH, NAME_MAX_LENGTH, UnitSystem


class SeedMemberSerializer(serializers.Serializer):
    key = serializers.RegexField(r'^[a-z][a-z0-9-]{0,19}$')
    name = serializers.CharField(max_length=NAME_MAX_LENGTH)
    unit_system = serializers.ChoiceField(choices=UnitSystem.choices, default=UnitSystem.METRIC)
    recipes = serializers.ListField(child=serializers.DictField(), max_length=20, default=list)


class SeedHouseholdSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=HOUSEHOLD_NAME_MAX_LENGTH, required=False)
    members = SeedMemberSerializer(many=True, min_length=1, max_length=10)


class SeedSerializer(serializers.Serializer):
    households = SeedHouseholdSerializer(many=True, min_length=1, max_length=10)

    def validate_households(self, households: list[dict[str, Any]]) -> list[dict[str, Any]]:
        keys = Counter(member['key'] for household in households for member in household['members'])
        repeated = sorted(key for key, count in keys.items() if count > 1)
        if repeated:
            raise serializers.ValidationError(
                f'Each member needs a key of its own; these repeat: {", ".join(repeated)}'
            )
        return households


class SeededRecipeSerializer(serializers.Serializer):
    title = serializers.CharField()
    slug = serializers.CharField()


class SeededAccountSerializer(serializers.Serializer):
    email = serializers.EmailField()
    name = serializers.CharField()
    session = serializers.CharField()
    recipes = SeededRecipeSerializer(many=True)


class SeededSerializer(serializers.Serializer):
    session_cookie = serializers.CharField()
    accounts = serializers.DictField(child=SeededAccountSerializer())
