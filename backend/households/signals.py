"""How a move between households reaches the areas that keep something of the account's, such as the recipes it wrote.
Households depends on no other area, so they listen here rather than being called."""

from django.dispatch import Signal

# Sent with `account`, saved in its new household, and `left`, the id of the household it left. Sent inside the move's
# transaction, holding its locks, before a household left empty is deleted.
member_moved = Signal()

# Sent with `account` to learn how many private recipes it would take with it if it moved now; answered with a count.
counting_recipes_to_copy = Signal()
