# Tastebook format, version 1

The file a person downloads from their account page ("Download everything") is one JSON document in this format. Importing reads it back, so a recipe that leaves Tastebook can come in again as the same recipe. The endpoint is `GET /api/account/download/` (`recipe_collections.views.DownloadView`); its serializers (`DownloadSerializer` in `backend/recipe_collections/serializers.py`) and `backend/schema.yml` are the exact contract, and `backend/tests/test_downloading.py` checks it.

A change that would make an existing file mean something else is a new version: bump `version`, and keep reading version 1.

## The file

```json
{
  "format": "tastebook",
  "version": 1,
  "exported_at": "2026-11-09T17:02:11.418204Z",
  "account": {
    "name": "Ada",
    "email": "ada@example.com",
    "unit_system": "metric",
    "household_name": "The Lovelaces"
  },
  "recipes": [],
  "lists": []
}
```

| Field | What it holds |
| --- | --- |
| `format` | Always `"tastebook"`. |
| `version` | Always `1` for this shape. |
| `exported_at` | When the file was made, in ISO 8601 with its time zone. |
| `account` | The account's `name`, `email`, `unit_system` (`metric` or `us`) and `household_name` (`null` before it has a household). |
| `recipes` | Every recipe held in full, by title: the household's private recipes, whoever wrote them, and the recipes the account wrote in its household, public ones too. A private recipe it wrote in a household it has left isn't here: that household keeps it, and the account took a copy when it moved. |
| `lists` | Every list the account sees: Favourites, then its own lists by name, then its household's by name. Favourites is here once something has been saved to it. |

The file names no other account, not even as a recipe's author. Sessions and sign-in records aren't in it: the privacy page says how to ask for them.

## A recipe

A recipe is in the shape the catalogue file (`backend/recipes/catalogue.json`) gives its recipes, which `recipes.services.add_described_recipes` already reads, with its `address` added and every field present. Cuisines, courses, equipment and ingredients are named, not numbered, so a file reads the same in any Tastebook.

```json
{
  "address": "https://tastebook.example/recipes/adas-curry-k4m9qz",
  "title": "Ada's curry",
  "description": "Mild and quick.",
  "cuisines": ["Indian"],
  "courses": ["Main"],
  "difficulty": "easy",
  "prep_minutes": 15,
  "cook_minutes": 30,
  "extra_minutes": 60,
  "extra_label": "marinating",
  "servings": 4,
  "yield_amount": null,
  "yield_unit": "",
  "equipment": ["Hob"],
  "one_pot": true,
  "source": "Grandma",
  "source_url": "",
  "photo_url": "https://upload.wikimedia.org/wikipedia/commons/a/ab/Curry.jpg",
  "photo_author": "Jo",
  "photo_licence": "CC BY-SA 4.0",
  "photo_source_url": "https://commons.wikimedia.org/wiki/File:Curry.jpg",
  "ingredient_lines": [
    {
      "amount": 1.5,
      "amount_max": 2.0,
      "unit": "kg",
      "ingredient": "onion",
      "note": "sliced",
      "optional": false,
      "original_text": "1.5 to 2 kg onions, sliced"
    }
  ],
  "ingredient_groups": [
    {
      "name": "To serve",
      "lines": [
        {
          "amount": null,
          "amount_max": null,
          "unit": "",
          "ingredient": "coriander",
          "note": "",
          "optional": true,
          "original_text": ""
        }
      ]
    }
  ],
  "steps": ["Fry the onions.", "Add the tomatoes."]
}
```

| Field | What it holds |
| --- | --- |
| `address` | The recipe's page in Tastebook. A save in `lists` with the same address is this recipe. Not part of the catalogue's shape: a reader drops it before handing the rest to `add_described_recipes`. |
| `title`, `description` | Text; `description` is `""` when there's none. |
| `cuisines`, `courses`, `equipment` | Names, as Tastebook lists them (`GET /api/cuisines/`, `/api/courses/`, `/api/equipment/`). |
| `difficulty` | `easy`, `medium`, `hard`, or `""`. |
| `prep_minutes`, `cook_minutes` | Whole minutes, or `null`. |
| `extra_minutes`, `extra_label` | Waiting time and what it's for (`marinating`); `0` and `""` when there's none. |
| `servings` | How many it serves, or `null` when it gives a yield or neither. |
| `yield_amount`, `yield_unit` | "Makes 12 cookies" is `12` and `"cookies"`; `null` and `""` when it gives servings or neither. |
| `one_pot` | Whether it's cooked in one pot. |
| `source`, `source_url` | Where the recipe came from and its page; `""` for none. |
| `photo_url` | The photo's address, or `""` for none. The photo itself isn't in the file. |
| `photo_author`, `photo_licence`, `photo_source_url` | A Wikimedia Commons photo's credit; `""` for an uploaded photo or none. |
| `ingredient_lines` | The lines above every group, in order. |
| `ingredient_groups` | Each group's `name` and its `lines`, in order. |
| `steps` | The method, one string a step, in order. |

An ingredient line:

| Field | What it holds |
| --- | --- |
| `amount` | A number above 0, or `null` for "to taste". |
| `amount_max` | The top of a range ("2 to 3" is `2` and `3`), or `null`. |
| `unit` | One of `g`, `kg`, `ml`, `l`, `tsp`, `tbsp`, `cup`, `oz`, `lb`, `fl_oz`, `pinch`, `clove`, `tin`, `slice`, `bunch`, `handful`, or `""` for none ("2 eggs"). |
| `ingredient` | The ingredient's name, as Tastebook's ingredient list has it. |
| `note` | "finely chopped"; `""` for none. |
| `optional` | Whether the recipe works without it. |
| `original_text` | The line as its source wrote it; `""` for a recipe written by hand. |

## A list

```json
{
  "name": "Favourites",
  "scope": "personal",
  "saved_recipes": [
    {
      "title": "Chicken tikka masala",
      "saved_at": "2026-11-02T19:14:03.120994Z",
      "address": "https://tastebook.example/recipes/chicken-tikka-masala"
    }
  ]
}
```

| Field | What it holds |
| --- | --- |
| `name` | The list's name. |
| `scope` | `personal` (only its owner sees it) or `household` (every member sees and changes it). |
| `saved_recipes` | Newest saved first. A saved recipe is a link, never a copy: its `title` as it was saved, `saved_at`, and the recipe's `address`, which is `null` once the recipe is unavailable (its author made it private or deleted it). A saved public recipe is only this link; one of the household's own recipes is also in `recipes` at the same address. |
