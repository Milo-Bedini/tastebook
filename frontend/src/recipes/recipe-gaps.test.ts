import { describe, expect, it } from 'vitest';

import type { components } from '../api/schema';
import { publishingGaps, recipeGaps } from './recipe-gaps';

type Recipe = components['schemas']['Recipe'];
type IngredientLine = components['schemas']['IngredientLine'];

const line: IngredientLine = {
  id: 1,
  amount: 2,
  amount_max: null,
  unit: 'tbsp',
  ingredient: { slug: 'olive-oil', name: 'olive oil', grams_per_cup: null, awaiting_review: false },
  note: '',
  optional: false,
  original_text: ''
};

const awaitingReview = (name: string): IngredientLine => ({
  ...line,
  ingredient: { slug: name.replaceAll(' ', '-'), name, grams_per_cup: null, awaiting_review: true }
});

const complete: Recipe = {
  id: 9,
  slug: 'zaatar-flatbreads-p3x9qa',
  visibility: 'private',
  author: null,
  title: "Za'atar flatbreads",
  description: '',
  cuisines: [],
  courses: [],
  difficulty: 'medium',
  prep_minutes: 15,
  cook_minutes: 30,
  extra_minutes: 0,
  extra_label: '',
  total_minutes: 45,
  photo: null,
  diet_tags: [],
  servings: 4,
  yield_amount: null,
  yield_unit: '',
  equipment: [],
  one_pot: false,
  source: '',
  source_url: '',
  ingredient_lines: [line],
  ingredient_groups: [],
  steps: [{ id: 1, text: 'Knead the dough.' }],
  diet_tag_conflicts: [],
  can_delete: false,
  can_edit: true,
  can_publish: false
};

describe('recipeGaps', () => {
  it.each<[string, Partial<Recipe>, string[]]>([
    ['nothing missing', {}, []],
    [
      'only a title',
      { ingredient_lines: [], steps: [], prep_minutes: null, cook_minutes: null, servings: null },
      ['No ingredients yet', 'No method yet', 'No prep time yet', 'No cook time yet', 'No servings yet']
    ],
    [
      'lines only in a group',
      { ingredient_lines: [], ingredient_groups: [{ id: 1, name: 'For the oil', lines: [line] }] },
      []
    ],
    ['a yield but no servings', { servings: null, yield_amount: 12, yield_unit: 'flatbreads' }, []],
    ['a prep time only', { cook_minutes: null }, ['No cook time yet']],
    ['a cook time only, and no method', { prep_minutes: null, steps: [] }, ['No method yet', 'No prep time yet']],
    [
      'a line awaiting review',
      { ingredient_lines: [line, awaitingReview('chipotle paste')] },
      ["No diet tags until we've checked chipotle paste"]
    ],
    [
      'two awaiting review, one in a group, and the first again',
      {
        ingredient_lines: [awaitingReview('chipotle paste')],
        ingredient_groups: [
          { id: 1, name: 'To serve', lines: [awaitingReview('gochujang'), awaitingReview('chipotle paste')] }
        ]
      },
      ["No diet tags until we've checked chipotle paste and gochujang"]
    ]
  ])('%s', (_, changes, gaps) => {
    expect(recipeGaps({ ...complete, ...changes })).toEqual(gaps);
  });
});

describe('publishingGaps', () => {
  it.each<[string, Partial<Recipe>, string[]]>([
    ['nothing missing', {}, []],
    ['only a line awaiting review', { ingredient_lines: [awaitingReview('chipotle paste')] }, []],
    [
      'a line awaiting review, no method and no servings',
      { ingredient_lines: [line, awaitingReview('chipotle paste')], steps: [], servings: null },
      ['No method yet', 'No servings yet']
    ],
    [
      'only a title',
      { ingredient_lines: [], steps: [], prep_minutes: null, cook_minutes: null, servings: null },
      ['No ingredients yet', 'No method yet', 'No prep time yet', 'No cook time yet', 'No servings yet']
    ]
  ])('%s', (_, changes, gaps) => {
    expect(publishingGaps({ ...complete, ...changes })).toEqual(gaps);
  });
});
