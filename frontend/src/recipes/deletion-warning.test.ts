import { describe, expect, it } from 'vitest';

import type { components } from '../api/schema';
import { deletionWarning } from './deletion-warning';

type Recipe = components['schemas']['Recipe'];
type IngredientLine = components['schemas']['IngredientLine'];

const lineOf = (id: number): IngredientLine => ({
  id,
  amount: 1,
  amount_max: null,
  unit: '',
  ingredient: { slug: 'onion', name: 'onion', grams_per_cup: null, awaiting_review: false },
  note: '',
  optional: false,
  original_text: ''
});

const linesOf = (count: number) => Array.from({ length: count }, (_, index) => lineOf(index + 1));

const stepsOf = (count: number) => Array.from({ length: count }, (_, index) => ({ id: index + 1, text: 'Stir.' }));

const chanaMasala: Recipe = {
  id: 3,
  slug: 'chana-masala-q4w8zt',
  visibility: 'private',
  author: null,
  title: 'Chana masala',
  description: '',
  cuisines: [],
  adapted_from: null,
  is_copy: false,
  courses: [],
  difficulty: '',
  prep_minutes: null,
  cook_minutes: null,
  extra_minutes: 0,
  extra_label: '',
  total_minutes: null,
  photo: null,
  diet_tags: [],
  servings: null,
  yield_amount: null,
  yield_unit: '',
  equipment: [],
  one_pot: false,
  source: '',
  source_url: '',
  original_source: '',
  original_source_url: '',
  ingredient_lines: [],
  ingredient_groups: [],
  steps: [],
  diet_tag_conflicts: [],
  can_delete: true,
  can_edit: true,
  can_publish: true,
  save_count: null
};

describe('deletionWarning', () => {
  it.each<[string, Partial<Recipe>, string]>([
    [
      '8 lines, some in a group, and 5 steps',
      {
        ingredient_lines: linesOf(5),
        ingredient_groups: [{ id: 1, name: 'For the tadka', lines: linesOf(3) }],
        steps: stepsOf(5)
      },
      "Chana masala, its 8 ingredients and 5 steps will be deleted for everyone in your household. You can't undo this."
    ],
    [
      '1 line and 1 step',
      { ingredient_lines: linesOf(1), steps: stepsOf(1) },
      "Chana masala, its 1 ingredient and 1 step will be deleted for everyone in your household. You can't undo this."
    ],
    [
      '3 lines and no steps',
      { ingredient_lines: linesOf(3) },
      "Chana masala and its 3 ingredients will be deleted for everyone in your household. You can't undo this."
    ],
    [
      'no lines and 2 steps',
      { steps: stepsOf(2) },
      "Chana masala and its 2 steps will be deleted for everyone in your household. You can't undo this."
    ],
    ['neither', {}, "Chana masala will be deleted for everyone in your household. You can't undo this."],
    [
      'saved by 6 other people',
      { save_count: 6 },
      "Chana masala will be deleted for everyone in your household. 6 people saved this; they'll see it's gone. You can't undo this."
    ],
    [
      'saved by 1 other person',
      { save_count: 1 },
      "Chana masala will be deleted for everyone in your household. 1 person saved this; they'll see it's gone. You can't undo this."
    ],
    [
      'saved by nobody else',
      { save_count: 0 },
      "Chana masala will be deleted for everyone in your household. You can't undo this."
    ]
  ])('%s', (_, recipe, expected) => {
    expect(deletionWarning({ ...chanaMasala, ...recipe })).toBe(expected);
  });
});
