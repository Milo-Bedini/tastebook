import type { SeedHouseholdOf } from './fixtures.ts';

// Sam, alone in "Sam's household".
export const soleCook: SeedHouseholdOf<'sam'>[] = [{ members: [{ key: 'sam', name: 'Sam' }] }];

// Sam and Ben in "Sam's household", and Cy in "Cy's household". Sam wrote "Grandma's curry", private to Sam's
// household, with only a cuisine and a prep time: no ingredients, method, cook time or servings.
export const unfinishedRecipe: SeedHouseholdOf<'sam' | 'ben' | 'cy'>[] = [
  {
    members: [
      {
        key: 'sam',
        name: 'Sam',
        recipes: [{ title: "Grandma's curry", cuisines: ['Indian'], prep_minutes: 20 }]
      },
      { key: 'ben', name: 'Ben' }
    ]
  },
  { members: [{ key: 'cy', name: 'Cy' }] }
];

// Sam and Ben in "Sam's household", and Cy in "Cy's household". Sam wrote "Grandma's curry", complete and still
// private to Sam's household, so Sam can make it public.
export const publishedRecipe: SeedHouseholdOf<'sam' | 'ben' | 'cy'>[] = [
  {
    members: [
      {
        key: 'sam',
        name: 'Sam',
        recipes: [
          {
            title: "Grandma's curry",
            cuisines: ['Indian'],
            prep_minutes: 20,
            cook_minutes: 40,
            servings: 4,
            ingredient_lines: [
              { amount: 1, ingredient: 'onion' },
              { amount: 2, ingredient: 'garlic', note: 'cloves' }
            ],
            steps: ['Fry the onion and garlic until soft.', 'Add the spices and simmer for 40 minutes.']
          }
        ]
      },
      { key: 'ben', name: 'Ben' }
    ]
  },
  { members: [{ key: 'cy', name: 'Cy' }] }
];
