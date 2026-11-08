from collections import Counter
from typing import Any

from rest_framework import serializers

from households.models import HOUSEHOLD_NAME_MAX_LENGTH, NAME_MAX_LENGTH, UnitSystem


class SeedMemberSerializer(serializers.Serializer):
    key = serializers.RegexField(r'^[a-z][a-z0-9-]{0,19}$')
    name = serializers.CharField(max_length=NAME_MAX_LENGTH)
    # Left out rather than given a default, so the generated request type has it optional.
    unit_system = serializers.ChoiceField(
        choices=UnitSystem.choices, required=False, help_text='metric when not given.'
    )
    added_ingredients = serializers.ListField(
        child=serializers.CharField(max_length=100),
        max_length=20,
        default=list,
        help_text='Ingredients this member adds, awaiting review, before their recipes are made; their recipes may '
        'name them.',
    )
    recipes = serializers.ListField(child=serializers.DictField(), max_length=20, default=list)
    saves = serializers.ListField(
        child=serializers.CharField(max_length=200),
        max_length=20,
        default=list,
        help_text="Titles of the recipes this member saves to Favourites, oldest first, once every member's recipes "
        'are made: a recipe a member of this seed wrote, or a catalogue recipe. Each must be one the member can see.',
    )


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
