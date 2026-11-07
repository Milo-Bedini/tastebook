import type { ComponentProps } from 'react';

import { Button, RemovableChip } from '../dino';
import { useCourses, useCuisines } from './choices-api';
import { dietTagLabels } from './diet-tags';
import { difficultyLabels } from './difficulty';
import { useIngredients } from './ingredients-api';
import type { RecipeFilters } from './recipe-filters';
import { noFilters, timeFilters } from './recipe-filters';

type Named = { slug: string; name: string };

type NamedLists = { courses?: Named[]; cuisines?: Named[]; ingredients?: Named[] };

type ChipLook = ComponentProps<typeof RemovableChip>['look'];

export type ActiveFilter = { key: string; label: string; without: RecipeFilters; look?: ChipLook };

// While the list loads or has failed, a chip shows its slug so it stays removable; once loaded, the API ignores a slug
// that isn't in it, so it gets no chip.
const namedChips = (
  kind: string,
  slugs: string[],
  list: Named[] | undefined,
  without: (slug: string) => RecipeFilters,
  toLabel: (name: string) => string = (name) => name
): ActiveFilter[] =>
  slugs.flatMap((slug) => {
    const name = list === undefined ? slug : list.find((item) => item.slug === slug)?.name;
    return name === undefined ? [] : [{ key: `${kind}-${slug}`, label: toLabel(name), without: without(slug) }];
  });

const INCLUDE_MATCH_KEY = 'include-match';

const includeMatchChip = (filters: RecipeFilters): ActiveFilter => ({
  key: INCLUDE_MATCH_KEY,
  label: 'With all of these',
  without: { ...filters, includeMatch: 'any' },
  look: 'outline'
});

const toActiveFilters = (filters: RecipeFilters, { courses, cuisines, ingredients }: NamedLists) => [
  ...timeFilters.flatMap(({ name, chip }): ActiveFilter[] => {
    const limit = filters.times[name];
    if (limit === null) {
      return [];
    }
    const without = { ...filters, times: { ...filters.times, [name]: null } };
    return [{ key: `time-${name}`, label: `${chip} up to ${limit} min`, without }];
  }),
  ...filters.difficulties.map(
    (difficulty): ActiveFilter => ({
      key: `difficulty-${difficulty}`,
      label: difficultyLabels[difficulty],
      without: { ...filters, difficulties: filters.difficulties.filter((item) => item !== difficulty) }
    })
  ),
  ...namedChips('course', filters.courses, courses, (slug) => ({
    ...filters,
    courses: filters.courses.filter((item) => item !== slug)
  })),
  ...namedChips('cuisine', filters.cuisines, cuisines, (slug) => ({
    ...filters,
    cuisines: filters.cuisines.filter((item) => item !== slug)
  })),
  ...(filters.onePot ? [{ key: 'one-pot', label: 'One-pot', without: { ...filters, onePot: false } }] : []),
  ...filters.diets.map(
    (diet): ActiveFilter => ({
      key: `diet-${diet}`,
      label: dietTagLabels[diet],
      without: { ...filters, diets: filters.diets.filter((item) => item !== diet) }
    })
  ),
  ...namedChips(
    'include',
    filters.includedIngredients,
    ingredients,
    (slug) => ({ ...filters, includedIngredients: filters.includedIngredients.filter((item) => item !== slug) }),
    (name) => `With ${name}`
  ),
  // Outlined because it changes how the With chips combine rather than adding a filter of its own.
  ...(filters.includeMatch === 'all' && filters.includedIngredients.length > 1 ? [includeMatchChip(filters)] : []),
  ...namedChips(
    'exclude',
    filters.excludedIngredients,
    ingredients,
    (slug) => ({ ...filters, excludedIngredients: filters.excludedIngredients.filter((item) => item !== slug) }),
    (name) => `Without ${name}`
  )
];

export const useActiveFilters = (filters: RecipeFilters) => {
  const { data: courses } = useCourses();
  const { data: cuisines } = useCuisines();
  const { data: ingredients } = useIngredients();
  return toActiveFilters(filters, { courses, cuisines, ingredients });
};

// The Filters button counts the chips, but not "With all of these": on its own it filters nothing.
export const countActiveFilters = (activeFilters: ActiveFilter[]) =>
  activeFilters.filter(({ key }) => key !== INCLUDE_MATCH_KEY).length;

type ActiveFiltersProps = { activeFilters: ActiveFilter[]; onChange: (filters: RecipeFilters) => void };

export const ActiveFilters = ({ activeFilters, onChange }: ActiveFiltersProps) => {
  if (activeFilters.length === 0) {
    return null;
  }
  return (
    <ul aria-label="Filters on" className="flex flex-wrap items-center gap-2">
      {activeFilters.map(({ key, label, without, look }) => (
        <li key={key}>
          <RemovableChip look={look} onRemove={() => onChange(without)}>
            {label}
          </RemovableChip>
        </li>
      ))}
      <li>
        <Button variant="ghost" onClick={() => onChange(noFilters)}>
          Clear filters
        </Button>
      </li>
    </ul>
  );
};
