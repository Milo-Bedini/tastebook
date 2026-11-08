"""How a recipe learns what other areas keep of it, such as who saved it. Recipes depends on no area but households,
so they answer here rather than being called."""

from django.dispatch import Signal

# Sent with `recipe` and `excluding`, an account, to learn how many other accounts have saved the recipe; answered with
# a count.
counting_saves = Signal()
