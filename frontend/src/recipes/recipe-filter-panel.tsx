import type { UseQueryResult } from '@tanstack/react-query';
import type { ComponentProps, ReactNode } from 'react';

import { ErrorWithRetry, FilterChip, SegmentedControl } from '../dino';
import { useCourses, useCuisines } from './choices-api';
import { dietTagLabels, dietTags } from './diet-tags';
import { difficulties, difficultyLabels } from './difficulty';
import { IngredientPicker } from './ingredient-picker';
import { useIngredients } from './ingredients-api';
import type { IncludeMatch, RecipeFilters, TimeFilterName } from './recipe-filters';
import { timeFilters, timeLimits, toggled } from './recipe-filters';

type FilterGroupProps = { legend: string; children: ReactNode };

const FilterGroup = ({ legend, children }: FilterGroupProps) => (
  <fieldset className="flex flex-col gap-2">
    <legend className="text-label">{legend}</legend>
    <div className="flex flex-wrap gap-2">{children}</div>
  </fieldset>
);

type Tilt = ComponentProps<typeof FilterChip>['tilt'];

// Alternates by the chip's place in its group; untilted in the sheet, since dialogs never tilt (docs/design.md, Tilt).
const tiltOf = (tilted: boolean, index: number): Tilt => {
  if (!tilted) {
    return undefined;
  }
  return index % 2 === 0 ? 'left' : 'right';
};

type Choice<T> = { value: T; label: string };

type ChoiceChipsProps<T> = {
  choices: Choice<T>[];
  selected: T[];
  onChange: (selected: T[]) => void;
  tilted: boolean;
};

const ChoiceChips = <T extends string>({ choices, selected, onChange, tilted }: ChoiceChipsProps<T>) =>
  choices.map(({ value, label }, index) => (
    <FilterChip
      key={value}
      tilt={tiltOf(tilted, index)}
      pressed={selected.includes(value)}
      onPressedChange={() => onChange(toggled(selected, value))}
    >
      {label}
    </FilterChip>
  ));

type FilterChangeProps = { filters: RecipeFilters; onChange: (filters: RecipeFilters) => void };

type ChipGroupProps = FilterChangeProps & { tilted: boolean };

type TimeGroupProps = ChipGroupProps & { name: TimeFilterName; legend: string };

// One limit at a time: "up to 30" already contains "up to 15".
const TimeGroup = ({ name, legend, filters, onChange, tilted }: TimeGroupProps) => (
  <FilterGroup legend={legend}>
    {timeLimits.map((limit, index) => (
      <FilterChip
        key={limit}
        tilt={tiltOf(tilted, index)}
        pressed={filters.times[name] === limit}
        onPressedChange={(pressed) =>
          onChange({ ...filters, times: { ...filters.times, [name]: pressed ? limit : null } })
        }
      >
        {`Up to ${limit} min`}
      </FilterChip>
    ))}
  </FilterGroup>
);

const difficultyChoices = difficulties.map((difficulty) => ({
  value: difficulty,
  label: difficultyLabels[difficulty]
}));

const DifficultyGroup = ({ filters, onChange, tilted }: ChipGroupProps) => (
  <FilterGroup legend="Difficulty">
    <ChoiceChips
      choices={difficultyChoices}
      selected={filters.difficulties}
      onChange={(selected) => onChange({ ...filters, difficulties: selected })}
      tilted={tilted}
    />
  </FilterGroup>
);

type QueryGroupProps<T> = {
  legend: string;
  query: UseQueryResult<T>;
  loading: string;
  errorTitle: string;
  children: (data: T) => ReactNode;
};

const QueryGroup = <T,>({ legend, query, loading, errorTitle, children }: QueryGroupProps<T>) => {
  const { data, errorUpdatedAt, refetch } = query;
  const content = () => {
    if (data !== undefined) {
      return children(data);
    }
    // A refetch resets a never-successful query to pending but leaves errorUpdatedAt, so the error stays up through its retry.
    if (errorUpdatedAt > 0) {
      return (
        <ErrorWithRetry title={errorTitle} onRetry={refetch}>
          Check your connection, then try again.
        </ErrorWithRetry>
      );
    }
    return <p>{loading}</p>;
  };
  return <FilterGroup legend={legend}>{content()}</FilterGroup>;
};

const CourseGroup = ({ filters, onChange, tilted }: ChipGroupProps) => (
  <QueryGroup legend="Course" query={useCourses()} loading="Loading courses…" errorTitle="Couldn't load courses">
    {(courses) => (
      <ChoiceChips
        choices={courses.map(({ slug, name }) => ({ value: slug, label: name }))}
        selected={filters.courses}
        onChange={(selected) => onChange({ ...filters, courses: selected })}
        tilted={tilted}
      />
    )}
  </QueryGroup>
);

const CuisineGroup = ({ filters, onChange, tilted }: ChipGroupProps) => (
  <QueryGroup legend="Cuisine" query={useCuisines()} loading="Loading cuisines…" errorTitle="Couldn't load cuisines">
    {(cuisines) => (
      <ChoiceChips
        choices={cuisines.map(({ slug, name }) => ({ value: slug, label: name }))}
        selected={filters.cuisines}
        onChange={(selected) => onChange({ ...filters, cuisines: selected })}
        tilted={tilted}
      />
    )}
  </QueryGroup>
);

const OnePotGroup = ({ filters, onChange, tilted }: ChipGroupProps) => (
  <FilterGroup legend="One-pot">
    <FilterChip
      tilt={tiltOf(tilted, 0)}
      pressed={filters.onePot}
      onPressedChange={(pressed) => onChange({ ...filters, onePot: pressed })}
    >
      One-pot only
    </FilterChip>
  </FilterGroup>
);

const dietChoices = dietTags.map((tag) => ({ value: tag, label: dietTagLabels[tag] }));

// Every diet picked must hold, so the chips toggle independently.
const DietGroup = ({ filters, onChange, tilted }: ChipGroupProps) => (
  <FilterGroup legend="Diet">
    <ChoiceChips
      choices={dietChoices}
      selected={filters.diets}
      onChange={(selected) => onChange({ ...filters, diets: selected })}
      tilted={tilted}
    />
  </FilterGroup>
);

const includeMatchOptions: { value: IncludeMatch; label: string }[] = [
  { value: 'any', label: 'With any' },
  { value: 'all', label: 'With all' }
];

const IngredientFilterGroup = ({ filters, onChange }: FilterChangeProps) => {
  // An ingredient picked in one list isn't offered in either, so it can't be both included and excluded.
  const picked = [...filters.includedIngredients, ...filters.excludedIngredients];
  return (
    <QueryGroup
      legend="Ingredients"
      query={useIngredients()}
      loading="Loading ingredients…"
      errorTitle="Couldn't load ingredients"
    >
      {(ingredients) => {
        const unpicked = ingredients.filter(({ slug }) => !picked.includes(slug));
        // A slug the API doesn't know gets no chip, as in Filters on.
        const known = (slugs: string[]) =>
          slugs.flatMap((slug) => ingredients.filter((ingredient) => ingredient.slug === slug));
        return (
          <>
            <IngredientPicker
              label="Include an ingredient"
              offered={unpicked}
              chosen={known(filters.includedIngredients)}
              onPick={(slug) => onChange({ ...filters, includedIngredients: [...filters.includedIngredients, slug] })}
              onRemove={(slug) =>
                onChange({
                  ...filters,
                  includedIngredients: filters.includedIngredients.filter((item) => item !== slug)
                })
              }
            />
            {/* With one included ingredient, any and all are the same, so the choice waits for a second. */}
            {filters.includedIngredients.length > 1 && (
              <SegmentedControl
                label="Included ingredients"
                options={includeMatchOptions}
                value={filters.includeMatch}
                onValueChange={(includeMatch) => onChange({ ...filters, includeMatch })}
              />
            )}
            <IngredientPicker
              label="Exclude an ingredient"
              offered={unpicked}
              chosen={known(filters.excludedIngredients)}
              onPick={(slug) => onChange({ ...filters, excludedIngredients: [...filters.excludedIngredients, slug] })}
              onRemove={(slug) =>
                onChange({
                  ...filters,
                  excludedIngredients: filters.excludedIngredients.filter((item) => item !== slug)
                })
              }
            />
          </>
        );
      }}
    </QueryGroup>
  );
};

type RecipeFilterPanelProps = ChipGroupProps & { id: string };

export const RecipeFilterPanel = ({ id, filters, onChange, tilted }: RecipeFilterPanelProps) => (
  <div id={id} className="flex flex-col gap-4">
    {timeFilters.map(({ name, legend }) => (
      <TimeGroup key={name} name={name} legend={legend} filters={filters} onChange={onChange} tilted={tilted} />
    ))}
    <DifficultyGroup filters={filters} onChange={onChange} tilted={tilted} />
    <CourseGroup filters={filters} onChange={onChange} tilted={tilted} />
    <CuisineGroup filters={filters} onChange={onChange} tilted={tilted} />
    <OnePotGroup filters={filters} onChange={onChange} tilted={tilted} />
    <DietGroup filters={filters} onChange={onChange} tilted={tilted} />
    <IngredientFilterGroup filters={filters} onChange={onChange} />
  </div>
);
