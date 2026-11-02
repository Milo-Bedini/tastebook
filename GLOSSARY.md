# Glossary

The words Tastebook uses, what each means, its name in code and the area that owns it. Code, UI copy, specs, issues and PRs use these names. Add a term in the PR that introduces it; change one here first, then everywhere it's used.

Names marked _planned_ don't exist in the code yet; use them when you build the thing.

## `recipes`

| Term | Meaning | In code |
| --- | --- | --- |
| Recipe | A dish with its ingredients, method and details. Public or private. | `Recipe` |
| Public recipe | A recipe anyone can find and save. Only recipes written by their author (or by Claude for them) can be public. | `Recipe.visibility` _planned_ |
| Private recipe | A recipe only its household can see. Imported recipes are always private. | `Recipe.visibility` _planned_ |
| Ingredient | A food in the shared ingredient list, under its UK name (courgette, coriander, plain flour). Records whether it contains meat, fish, dairy, animal rennet, egg, another animal product or gluten. | `Ingredient`, `contains_meat`, `contains_fish`, `contains_dairy`, `contains_animal_rennet`, `contains_egg`, `contains_other_animal_product`, `contains_gluten` |
| Synonym | Another name for an ingredient, including US names (zucchini for courgette). Search finds the ingredient by any of them. | `IngredientSynonym` |
| Ingredient line | One line of a recipe's ingredients: amount, unit, ingredient, note, and whether it's optional. | `IngredientLine` |
| Ingredient group | A named group of ingredient lines ("For the sauce", "To serve"). | `IngredientGroup` |
| Original wording | An ingredient line as its source wrote it ("1 cup plain flour, sifted"), shown by "Show original". A recipe written by hand has none. | `IngredientLine.original_text` |
| Optional ingredient | An ingredient line the recipe works without. It doesn't count against a match or change diet tags. | `IngredientLine.optional` |
| Amount | How much of an ingredient: a number, a range (2–3) or none ("to taste"). | `IngredientLine.amount`, `amount_max` |
| Unit | A unit from Tastebook's fixed list (g, ml, tsp, cup…), or none ("2 eggs"). | `Unit` |
| Unit system | Metric (the default) or US customary, for reading amounts. Amounts convert within a dimension (volume or weight); count units never convert. An account's choice opens every recipe page in it. | `UnitSystem`, `convert()`, `User.unit_system` |
| Step | One step of a recipe's method, in order. | `Step` |
| Method | A recipe's steps, in order. | `Recipe.steps` |
| Equipment | A tool from the shared equipment list (oven, hob, stand mixer…) that a recipe needs. | `Equipment` |
| Cuisine | A cooking tradition a recipe belongs to (Italian, Thai). | `Cuisine` |
| Course | Where a recipe sits in a meal: main, side, dessert, breakfast, baking. | `Course` |
| Difficulty | Easy, medium or hard. | `Difficulty` |
| Diet tag | Vegetarian, vegan, gluten-free or dairy-free. Computed from the ingredients, never typed in. | `DietTag`, `diet_tags` |
| Diet tag conflict | An optional ingredient that would take a diet tag away from its recipe, named on the recipe's page ("Leave out the parmesan to keep it vegetarian, vegan and dairy-free."). | `diet_tag_conflicts` |
| One-pot | A recipe cooked in a single vessel. | `Recipe.one_pot` |
| Prep time, cook time, extra time, total time | Minutes of preparation, of cooking, and of waiting (marinating, resting, proving, with a label). Total time is all three. | `prep_minutes`, `cook_minutes`, `extra_minutes`, `extra_label`, `total_minutes` |
| Servings | How many people a recipe feeds ("serves 4"). | `Recipe.servings` |
| Yield | How much a recipe makes, with a unit ("makes 12 cookies"), instead of servings. | `Recipe.yield_amount`, `yield_unit` |
| Scaling | Changing servings or yield, which changes every amount, rounded to what you can measure. | `scale()` |
| Source credit | Where a recipe came from: an author, a website, or "Adapted from the Wikibooks Cookbook (CC BY-SA 4.0), …", linked to the original page when the recipe has its address. | `Recipe.source`, `Recipe.source_url` |
| Photo | A recipe's one picture, an image on Wikimedia Commons: 7:5 at the top of its page, 4:3 in its polaroid card. | `Recipe.photo_url`, `Recipe.photo` |
| Photo credit | A photo's author, its licence and a link to its page on Wikimedia Commons, shown inside its polaroid's frame on the recipe's page. | `photo_author`, `photo_licence`, `photo_source_url` |
| Photo filler | The place setting or gingham rug drawn in a recipe's polaroid where it has no photo, picked from the recipe's ID. | `PhotoFiller` |
| Catalogue | The public recipes Tastebook seeds itself with, loaded from a file in the repo with the shared ingredient and equipment lists. | `catalogue.json`, `load_catalogue` |
| Report | A signed-in person flagging a public recipe, which hides it until staff review it. | `Report` _planned_ |
| Slug | The recipe's address in a URL, set once from its title. | `Recipe.slug` |

## `households`

| Term | Meaning | In code |
| --- | --- | --- |
| Account | A person who has signed up. Signs in with an email code or Google. Has a name, shown on recipes it writes ("by Milo"), and a unit system. | `User` |
| Sign-in code | The 6-digit code emailed to sign in or sign up. Works once, for 10 minutes, and stops after 5 wrong tries. An address is sent at most 3 in 10 minutes. | `allauth`'s login code and email verification code |
| Test account | A throwaway account at tastebook.test for end-to-end tests. Its codes are stored, not emailed, and production refuses it. | `StoredSignInCode`, `is_test_account()` |
| Household | The people who cook together. Every account belongs to exactly one, once it has a name; a new one starts as "<name>'s household". It owns private recipes, the plan, the shopping list, the pantry and the household's equipment. | `Household` |
| Member | An account in a household. Members are equal: any of them can rename it, remove another member or leave; whoever goes lands in a household of their own. | `User.household`, `Household.members` |
| Invite | A link that lets someone join a household. | `Invite` _planned_ |
| Staff | An account that can use the admin pages (moderation, fixing data). Needs two-factor sign-in. | `User.is_staff`, `make_staff` |
| Two-factor sign-in | Signing in with an email code or Google and then a 6-digit code from an authenticator app. Staff only; asked at every sign-in. | `allauth.mfa`, `passed_two_factors()` |
| Recovery code | One of ten 8-digit codes shown once when two-factor sign-in is set up. Each signs in once in place of the app's code. | `allauth`'s recovery codes |

## `collections`

| Term | Meaning | In code |
| --- | --- | --- |
| Save | Keeping a link to someone's public recipe, so you see the author's fixes. | `SavedRecipe` _planned_ |
| List | A named collection of saved and own recipes. Personal or household. | `RecipeList` _planned_ |
| Favourites | The list every account starts with. | `RecipeList` (default) _planned_ |
| Copy | A private recipe made from another, to change it. Can be published as "Adapted from X by Y". | `Recipe.adapted_from` _planned_ |
| Share link | A read-only link to a private recipe you wrote, for someone outside the household. | `ShareLink` _planned_ |

## `kitchen`

| Term | Meaning | In code |
| --- | --- | --- |
| Always have | Staples assumed in every match (salt, pepper, oil, water to start). Editable. | `AlwaysHave` _planned_ |
| Pantry | What the household has, without quantities. | `PantryItem` _planned_ |
| Kitchen equipment | The equipment a household has. Not the same as a recipe's equipment. | `KitchenEquipment` _planned_ |
| What I have | Finding recipes by the ingredients you have, ranked by match. | `what_i_have()` _planned_ |
| Match | The share of a recipe's required ingredients you have, with what's missing listed. | `Match` _planned_ |
| Cooking mode | Cooking from a recipe on a phone: mise en place first, then one step at a time, with timers, the screen kept awake. | `cooking-mode` _planned_ |
| Mise en place | The first screen of cooking mode: every ingredient, scaled, with its note, and the equipment, each ticked off. | _planned_ |

## `planning`

| Term | Meaning | In code |
| --- | --- | --- |
| Meal plan | A household's Monday to Sunday week of recipes. | `MealPlan` _planned_ |
| Planned recipe | One recipe on one day of the plan, with its own servings and an optional label ("lunch"). | `PlannedRecipe` _planned_ |
| Shopping list | What to buy for the plan: merged by ingredient, "always have" left out, grouped by aisle, plus your own items. | `ShoppingList` _planned_ |
| Shopping list item | One line of the shopping list, ticked off when bought (which adds it to the pantry). | `ShoppingListItem` _planned_ |
| Aisle | The part of a shop an ingredient is found in (fruit and veg, dairy…). | `Aisle` _planned_ |

## `importing`

| Term | Meaning | In code |
| --- | --- | --- |
| Import | Bringing a recipe in from a web address, pasted text or the Tastebook format. Always private, always credits its source. | `Import` _planned_ |
| Tastebook format | The recipe format Tastebook publishes, with a prompt to copy into your own Claude, which Tastebook reads without AI. | `tastebook-format` _planned_ |
| Gap | Something an import couldn't read, flagged on the recipe for you to fix. | `ImportGap` _planned_ |

## Across areas

| Term | Meaning |
| --- | --- |
| Domain area | One of `recipes`, `households`, `collections`, `kitchen`, `planning`, `importing`. See `AGENTS.md`, Domain areas. |
| Preview | The deployment of a PR, with its own database branch. |
| Event | A record of something the success measures count (a plan used, cooking mode opened, an import saved without fixes), kept in Tastebook's own database. |
