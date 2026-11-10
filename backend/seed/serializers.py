from collections import Counter
from typing import Any

from rest_framework import serializers

from households.models import HOUSEHOLD_NAME_MAX_LENGTH, NAME_MAX_LENGTH, UnitSystem
from recipe_collections.models import LIST_NAME_MAX_LENGTH, Scope


class SeedListSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=LIST_NAME_MAX_LENGTH)
    # Left out rather than given a default, so the generated request type has it optional.
    scope = serializers.ChoiceField(choices=Scope.choices, required=False, help_text='personal when not given.')
    recipes = serializers.ListField(
        child=serializers.CharField(max_length=200),
        max_length=20,
        default=list,
        help_text='Titles of the recipes in it, oldest first, as saves name them.',
    )


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
    lists = SeedListSerializer(
        many=True,
        max_length=10,
        default=list,
        help_text="Lists this member makes, the member's own or the household's, once every save is made.",
    )
    copies = serializers.ListField(
        child=serializers.CharField(max_length=200),
        max_length=20,
        default=list,
        help_text='Titles of the recipes this member makes a copy of, once every list is made, as saves name them. '
        "Each copy is listed after the member's own recipes.",
    )
    made_private = serializers.ListField(
        child=serializers.CharField(max_length=200),
        max_length=20,
        default=list,
        help_text="Titles of this member's own public recipes they make private once every copy is made, so a copy of "
        "one is adapted from a recipe that isn't public.",
    )
    shared = serializers.ListField(
        child=serializers.CharField(max_length=200),
        max_length=20,
        default=list,
        help_text="Titles of this member's own private recipes they share by link once every recipe is made private.",
    )
    made_public = serializers.ListField(
        child=serializers.CharField(max_length=200),
        max_length=20,
        default=list,
        help_text="Titles of this member's own private recipes they make public, in order, once every share is made. "
        'Each counts towards the day, so once 3 are public each one more waits for review.',
    )
    restored = serializers.ListField(
        child=serializers.CharField(max_length=200),
        max_length=20,
        default=list,
        help_text="Titles of this member's own public recipes that staff have restored, as if after an earlier report, "
        "once every share is made and before anyone's reports, so a report leaves them up.",
    )
    removed = serializers.ListField(
        child=serializers.CharField(max_length=200),
        max_length=20,
        default=list,
        help_text="Titles of this member's own recipes that staff have removed from public view, as if after an "
        "earlier report, once every restore is made: each is private, and its author can't make it public again.",
    )
    reports = serializers.ListField(
        child=serializers.CharField(max_length=200),
        max_length=20,
        default=list,
        help_text="Titles of other households' public recipes this member reports as spam, last of all, as saves name "
        'them. The first report of a recipe that is not restored hides it from everyone but its author.',
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
    share_token = serializers.CharField(
        source='share_link.token',
        allow_null=True,
        help_text="The token of its share link, which /shared/<token> opens; null when it's off.",
    )


class SeededAccountSerializer(serializers.Serializer):
    email = serializers.EmailField()
    name = serializers.CharField()
    session = serializers.CharField()
    recipes = SeededRecipeSerializer(many=True)


class SeededSerializer(serializers.Serializer):
    session_cookie = serializers.CharField()
    accounts = serializers.DictField(child=SeededAccountSerializer())
