import { describe, expect, it } from 'vitest';

import { matchesIngredient, namesIngredient } from './ingredient-match';

describe('matchesIngredient', () => {
  it.each<[string, string[], string, boolean]>([
    ['aubergine', [], 'aub', true],
    ['aubergine', ['eggplant'], 'EGGPLANT', true],
    ['aubergine', ['eggplant'], ' plant ', true],
    ['crème fraîche', [], 'creme fraiche', true],
    ['creme fraiche', [], 'crème', true],
    ['flat-leaf parsley', ['Italian parsley'], 'italian', true],
    ['aubergine', [], '', true],
    ['aubergine', ['eggplant'], 'courgette', false]
  ])('%s, also %j, matching "%s" is %s', (name, synonyms, text, expected) => {
    expect(matchesIngredient({ slug: name.replaceAll(' ', '-'), name, synonyms }, text)).toBe(expected);
  });
});

describe('namesIngredient', () => {
  it.each<[string, string[], string, boolean]>([
    ['aubergine', ['eggplant'], 'eggplant', true],
    ['aubergine', ['eggplant'], ' Aubergine ', true],
    ['crème fraîche', [], 'creme fraiche', true],
    ['aubergine', ['eggplant'], 'eggpl', false],
    ['chipotle chilli', [], 'chipotle', false],
    ['aubergine', [], '', false]
  ])('%s, also %j, named by "%s" is %s', (name, synonyms, text, expected) => {
    expect(namesIngredient({ slug: name.replaceAll(' ', '-'), name, synonyms }, text)).toBe(expected);
  });
});
