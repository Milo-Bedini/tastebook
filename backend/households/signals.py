"""How a move between households, or an account's deletion, reaches the areas that keep something of the account's,
such as the recipes it wrote. Households depends on no other area, so they listen here rather than being called."""

from django.dispatch import Signal

# Sent with `account`, saved in its new household, and `left`, the id of the household it left. Sent inside the move's
# transaction, holding its locks, before a household left empty is deleted.
member_moved = Signal()

# Sent with `account` to learn how many private recipes it would take with it if it moved now; answered with a count.
counting_recipes_to_copy = Signal()

# Sent with `account`, which has a household, and `last`, whether it's that household's last member, to learn how many
# private recipes deleting it now would delete; answered with a count.
counting_recipes_to_delete = Signal()

# Sent with `account`, which has a household, and `last`, to learn how many public recipes would stay in its household
# once it's deleted; answered with a count.
counting_recipes_to_keep = Signal()

# Sent with `account`, which has a household, inside the deletion's transaction holding the household's and the
# account's locks, before the account is deleted. Receivers delete what goes with it that deleting the account doesn't
# cascade to.
account_deleting = Signal()

# Sent with `household_id`, a household nobody is left in once its last member moved out or was deleted, inside that
# transaction holding the household's lock. Receivers delete what nobody is left to see: its private recipes and lists.
household_emptied = Signal()

# Sent with `household_id` after household_emptied, to learn how many public recipes the household still holds;
# answered with a count.
counting_public_recipes_in = Signal()
