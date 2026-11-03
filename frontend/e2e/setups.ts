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
