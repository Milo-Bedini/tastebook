# Glossary

The words Tastebook uses, what each means, its name in code and the area that owns it. Code, UI copy, specs, issues and PRs use these names. Add a term in the PR that introduces it; change one here first, then everywhere it's used.

Names marked _planned_ don't exist in the code yet; use them when you build the thing.

## `recipes`

| Term | Meaning | In code |
| --- | --- | --- |
| Recipe | A dish with its ingredients, method and details. Public or private. | `Recipe` |
| Public recipe | A recipe anyone can find and open, signed in or not: a catalogue recipe, or a household recipe its author has published, shown "by <name>". | `Recipe.visibility`, `RecipeQuerySet.public` |
| Private recipe | A recipe only its household can see. Imported recipes are always private. | `Recipe.visibility`, `RecipeQuerySet.private` |
| Share link | A read-only link to a private recipe you wrote, for anyone you send it to, signed in or not. It shows the recipe and nothing else of the household's, and stops when you turn it off, make the recipe public or delete it, or move household; turning it on again makes a new one. | `ShareLink`, `turn_on_share_link()`, `turn_off_share_link()`, `RecipeShare`, `/shared/<token>` |
| Household recipe | A recipe a household owns, private until its author publishes it; any member can edit it while it's private, only its author once it's public; only its author can delete it (or any member once the author has left the household), and the catalogue load leaves it alone. | `Recipe.household`, `RecipeQuerySet.editable_by`, `RecipeQuerySet.deletable_by` |
| Publish | Making a household recipe public, which only its author can, once it has ingredients, a method, prep and cook times and servings or a yield. Making it private again undoes it. | `set_visibility()`, `publishing_gaps()`, `RecipeQuerySet.publishable_by` |
| Waiting for review | A recipe its author asked to make public after making 3 others public that day (from midnight in London): it stays private, its page and card say "Waiting for review" and its Public switch shows on, until staff approve it in the admin's recipes waiting for review, which makes it public. Turning the switch off withdraws it. Its household can still edit or delete it. | `Moderation.HELD`, `Recipe.published_at`, `PUBLIC_A_DAY`, `waits_for_review()`, `approve_recipe()`, `HeldRecipe` |
| Author | The account that wrote a recipe. Once that account is deleted, a public recipe it wrote is credited to "a former member". | `Recipe.created_by` |
| Former member | How a public recipe credits an author who has deleted their account: "by a former member". | `FORMER_MEMBER` |
| Ingredient | A food in the shared ingredient list, under its UK name (courgette, coriander, plain flour). Records whether it contains meat, fish, dairy, animal rennet, egg, another animal product or gluten. | `Ingredient`, `contains_meat`, `contains_fish`, `contains_dairy`, `contains_animal_rennet`, `contains_egg`, `contains_other_animal_product`, `contains_gluten` |
| Synonym | Another name for an ingredient, including US names (zucchini for courgette). Search finds the ingredient by any of them. | `IngredientSynonym` |
| Added ingredient | An ingredient someone added by name from the recipe form because the shared list didn't have it. It awaits review until staff check what it contains in the admin: meanwhile recipes using it show no diet tags, and only households whose recipes use it are offered it. The catalogue load leaves it alone. | `Ingredient.status` (`IngredientStatus`), `add_ingredient()` |
| Ingredient line | One line of a recipe's ingredients: amount, unit, ingredient, note, and whether it's optional. | `IngredientLine` |
| Ingredient group | A named group of ingredient lines ("For the sauce", "To serve"). | `IngredientGroup` |
| Original wording | An ingredient line as its source wrote it ("1 cup plain flour, sifted"), shown by "Show original". A recipe written by hand has none. | `IngredientLine.original_text` |
| Optional ingredient | An ingredient line the recipe works without. It doesn't count against a match or change diet tags. | `IngredientLine.optional` |
| Amount | How much of an ingredient: a number, a range (2–3) or none ("to taste"). | `IngredientLine.amount`, `amount_max` |
| Unit | A unit from Tastebook's fixed list (g, ml, tsp, cup…), or none ("2 eggs"). | `Unit` |
| Unit system | Metric (the default) or US customary, for reading amounts. Amounts convert within a dimension (volume or weight), except a dry good's (see Cups to grams); count units never convert. An account's choice opens every recipe page in it. | `UnitSystem`, `convert()`, `crossesDimensions`, `User.unit_system` |
| Grams per cup | What a US cup of a dry good weighs, from USDA FoodData Central. Only dry goods have one. | `Ingredient.grams_per_cup` |
| Cups to grams | Reading a dry good with grams per cup across dimensions: in metric its cups and millilitres read as grams, in US customary its grams as spoons and cups. On when a recipe opens; its chip ("Cups to grams", or "Grams to cups" in US customary) turns it off for the visit. | `Reading.crossesDimensions`, `canCrossDimensions()` |
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
| Photo | A recipe's one picture: an image on Wikimedia Commons, or one a household uploads from the recipe form. 7:5 at the top of its page, 4:3 in its polaroid card. | `Recipe.photo_url`, `Recipe.photo`, `PhotoField` |
| Photo credit | A Wikimedia Commons photo's author, its licence and a link to its page on Commons, shown inside its polaroid's frame on the recipe's page. An uploaded photo has none. | `photo_author`, `photo_licence`, `photo_source_url`, `Photo.credit` |
| Photo filler | The place setting or gingham rug drawn in a recipe's polaroid where it has no photo, picked from the recipe's ID. | `PhotoFiller` |
| Catalogue | The public recipes Tastebook seeds itself with, loaded from a file in the repo with the shared ingredient and equipment lists. | `catalogue.json`, `load_catalogue` |
| Report | Someone signed in flagging another household's public recipe to staff, once each, as spam, offensive, copied without credit or something else, with an optional note. The first hides the recipe from everyone but its author ("Hidden while a report is reviewed", and "Hidden for review" on their card), who can't make it private until staff review it; once staff restore it, later reports reach staff and leave it up. Staff review reports in the admin's reported recipes, which marks them reviewed and emails the author the outcome and the reasons (never who reported it). Removing a recipe makes it private to its household for good: its author can't make it public again. | `Report`, `ReportReason`, `report_recipe()`, `Recipe.moderation` (`Moderation`), `restore_recipe()`, `remove_recipe()`, `review_reports()`, `Report.reviewed_at`, `ReportedRecipe`, `RecipeQuerySet.reportable_by`, `ReportRecipe` |
| Staff email | The email each staff account gets, at most once an hour, when a report or a recipe waiting for review has joined the queue since the last one, listing everything waiting with links to the admin. | `email_staff_what_waits()`, `StaffEmail`, `email_staff` |
| Slug | The recipe's address in a URL, set once from its title. | `Recipe.slug` |
| Copy | A private recipe made from another you can see, to change it: written by you, with the same title, its page saying "Copied from <original>" while you can see the original. Can be published as "Adapted from X by Y" (just "Adapted from X" for a catalogue original). Once the original is deleted or made private, it says "Adapted from a recipe that's no longer public". A copy of a catalogue recipe keeps the original's source credit, with its licence, where editing can't reach it. A recipe a member takes along when they move household is copied but isn't a Copy: it doesn't link to the one left behind, though a Copy taken along still links to its original. | `Recipe.adapted_from`, `Recipe.is_copy`, `Recipe.original_source`, `copy_recipe()`, `CopyRecipe` |

## `households`

| Term | Meaning | In code |
| --- | --- | --- |
| Account | A person who has signed up. Signs in with an email code or Google. Has a name, shown on recipes it writes ("by Milo"), and a unit system. Deleting it with a code from its email (from the account page: _planned_) deletes its name, email address, sessions, Favourites, personal lists and the private recipes it wrote; staff can't. | `User`, `delete_account()` |
| Sign-in code | The 6-digit code emailed to sign in or sign up. Works once, for 10 minutes, and stops after 5 wrong tries. An address is sent at most 3 in 10 minutes. | `allauth`'s login code and email verification code |
| Test account | A throwaway account at tastebook.test for end-to-end tests. Its codes are stored, not emailed, and production refuses it. The seed makes them signed in, with households and recipes. | `StoredSignInCode`, `is_test_account()`, `seed()` |
| Household | The people who cook together. Every account belongs to exactly one, once it has a name; a new one starts as "<name>'s household". It owns private recipes, the plan, the shopping list, the pantry and the household's equipment. When its last member deletes their account it's kept, renamed "A former household", only while it holds public recipes. | `Household` |
| Former household | A household whose last member deleted their account, kept for its public recipes only: renamed, with no members, lists, invite or private recipes. | `FORMER_HOUSEHOLD` |
| Member | An account in a household. Members are equal: any of them can rename it, remove another member or leave; whoever goes lands in a household of their own. Whoever moves, by leaving, being removed or joining, takes a copy of each private recipe they wrote, by them and linked to nothing; the household keeps its own. A public recipe they wrote moves with them. | `User.household`, `Household.members`, `member_moved` |
| Invite | A link that lets anyone who has it join a household, for 7 days, until a member cancels it. A household has at most one live invite; removing a member cancels it too. | `Invite`, `make_invite()`, `cancel_invite()` |
| Join | Moving into a household from its invite link. You leave your current household, which is deleted if nobody's left in it, and take a copy of each private recipe you wrote; a public recipe you wrote moves with you. | `join_household()` |
| Staff | An account that can use the admin pages (moderation, fixing data). Needs two-factor sign-in. | `User.is_staff`, `make_staff` |
| Two-factor sign-in | Signing in with an email code or Google and then a 6-digit code from an authenticator app. Staff only; asked at every sign-in. | `allauth.mfa`, `passed_two_factors()` |
| Recovery code | One of ten 8-digit codes shown once when two-factor sign-in is set up. Each signs in once in place of the app's code. | `allauth`'s recovery codes |

## `collections`

| Term | Meaning | In code |
| --- | --- | --- |
| Save | Keeping a link to a recipe you can see, someone's public recipe or your household's own, so you see the author's fixes. Unsaving takes it out; Undo puts it back where it was. Moving to another household takes the old household's private recipes, which you no longer see, out of your own lists. | `SavedRecipe`, `save_to_favourites()`, `save_to_list()`, `lists_holding()`, `unsave()` |
| List | A named collection of saved and own recipes, newest added first. Personal (only its owner sees it) or household (every member sees and changes it, and it stays with the household when someone leaves). Its name is unique among its owner's lists, or the household's, and its address is made from it: `/lists/<slug>` or `/lists/household/<slug>`. Removing takes a recipe out; the recipe itself stays. | `RecipeList`, `RecipeList.scope` (`Scope`), `make_list()`, `rename_list()`, `delete_list()` |
| Favourites | The list every account has, which can't be renamed or deleted; the heart saves to it. Newest saved first. | `RecipeList.favourites`, `FavouriteButton` (Dino) |
| Unavailable recipe | A saved recipe its author has since made private or deleted. It keeps its place in the list, shown by the title it was saved with, and can only be unsaved. | `UnavailableRecipe` (Dino) |
| Download | One file in the Tastebook format with everything an account has: its details, its household's private recipes and the recipes it wrote there in full, and every list it sees, saved recipes as their addresses and photos as theirs. "Download everything" on the account page. | `download_for()`, `DownloadView`, `/api/account/download/`, `useDownloadEverything` |

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
| Tastebook format | The recipe format Tastebook publishes, with a prompt to copy into your own Claude, which Tastebook reads without AI. Version 1 is the download's, documented in [`docs/tastebook-format.md`](docs/tastebook-format.md); the prompt is still to come. | `DownloadSerializer`, `FORMAT_VERSION`; the prompt `tastebook-format` _planned_ |
| Gap | Something an import couldn't read, flagged on the recipe for you to fix. | `ImportGap` _planned_ |

## Across areas

| Term | Meaning |
| --- | --- |
| Domain area | One of `recipes`, `households`, `collections`, `kitchen`, `planning`, `importing`. See `AGENTS.md`, Domain areas. |
| Preview | The deployment of a PR, with its own database branch. |
| Event | A record of something the success measures count (a plan used, cooking mode opened, an import saved without fixes), kept in Tastebook's own database. |
