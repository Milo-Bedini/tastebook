from typing import Any

from rest_framework import serializers

from households.models import HOUSEHOLD_NAME_MAX_LENGTH, NAME_MAX_LENGTH, InviteStatus, UnitSystem


class SignInCodeSerializer(serializers.Serializer):
    code = serializers.CharField()


class AccountSerializer(serializers.Serializer):
    email = serializers.EmailField()
    name = serializers.CharField()
    unit_system = serializers.ChoiceField(choices=UnitSystem.choices)


class AccountChangesSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=NAME_MAX_LENGTH, required=False)
    unit_system = serializers.ChoiceField(choices=UnitSystem.choices, required=False)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        if not attrs:
            raise serializers.ValidationError('Send a name or a unit system.')
        return attrs


class CurrentAccountSerializer(serializers.Serializer):
    account = AccountSerializer(allow_null=True)


class MemberSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    is_you = serializers.BooleanField()


class InviteSerializer(serializers.Serializer):
    token = serializers.CharField()
    expires_at = serializers.DateTimeField()
    status = serializers.ChoiceField(choices=InviteStatus.choices)


class HouseholdSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    members = MemberSerializer(many=True)
    invite = InviteSerializer(allow_null=True)


class HouseholdChangesSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=HOUSEHOLD_NAME_MAX_LENGTH)


class InvitedHouseholdSerializer(serializers.Serializer):
    name = serializers.CharField()
    members = MemberSerializer(many=True)


class JoinInviteSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=InviteStatus.choices)
    is_member = serializers.BooleanField()
    household = InvitedHouseholdSerializer(allow_null=True)
    recipes_to_copy = serializers.IntegerField(
        help_text='How many private recipes the viewer wrote in their household and would take a copy of by joining. '
        '0 when the link offers them no household to join.'
    )
    lists_to_delete = serializers.IntegerField(
        help_text="How many household lists joining would delete: their household's, when they're its only member, as "
        'it is deleted once they leave. 0 when others stay in it, or when the link offers them no household to join.'
    )


class AccountDeletionSerializer(serializers.Serializer):
    private_recipes = serializers.IntegerField(
        help_text='How many private recipes deleting the account now would delete: those it wrote in its household, '
        "or every private recipe in it when it's the household's last member. 0 with no household."
    )
    public_recipes = serializers.IntegerField(
        help_text='How many public recipes stay, credited "a former member": those it wrote in its household, or every '
        "public recipe in it when it's the household's last member. 0 with no household."
    )
    others_in_household = serializers.IntegerField(
        help_text='How many members stay in the household. 0 for its last member or an account with no household.'
    )
    is_staff = serializers.BooleanField(help_text="Whether it's a staff account, which can't delete itself here.")


class AccountDeletionCodeSerializer(serializers.Serializer):
    code = serializers.CharField()
