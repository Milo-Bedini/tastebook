import { useId } from 'react';

import type { components } from '../api/schema';
import { AmountList } from '../dino';
import { capitalise } from './capitalise';
import { convert, type UnitSystem } from './convert';
import { formatQuantity } from './format-quantity';
import { isLaptopQuery, useMediaQuery } from './use-media-query';

type Recipe = components['schemas']['Recipe'];
type IngredientLine = components['schemas']['IngredientLine'];

export type Reading = { factor: number; system: UnitSystem; showOriginal: boolean; crossesDimensions: boolean };

const amountOf = (line: IngredientLine, { factor, system, crossesDimensions }: Reading) =>
  formatQuantity(convert(line, factor, system, crossesDimensions ? line.ingredient.grams_per_cup : null));

// The line as Tastebook would write it, scaled and in the unit system, without the optional marker.
const describeLine = (line: IngredientLine, reading: Reading) => {
  const quantity = amountOf(line, reading);
  return `${quantity === '' ? '' : `${quantity} `}${line.ingredient.name}${line.note === '' ? '' : `, ${line.note}`}`;
};

// A line written by hand has no original wording, so it reads as Tastebook shows it.
const differsFromOriginal = (line: IngredientLine, reading: Reading) =>
  line.original_text !== '' && line.original_text !== describeLine(line, reading);

const itemOf = (line: IngredientLine, reading: Reading) => {
  if (reading.showOriginal && line.original_text !== '') {
    return { key: line.id, name: line.original_text, amount: '' };
  }
  const name = (
    <>
      {capitalise(line.ingredient.name)}
      {line.note !== '' && `, ${line.note}`}
      {line.optional && <span className="text-muted"> (optional)</span>}
    </>
  );
  return { key: line.id, name, amount: amountOf(line, reading) };
};

type LinesProps = { lines: IngredientLine[]; reading: Reading };

const IngredientLines = ({ lines, reading }: LinesProps) => (
  <AmountList items={lines.map((line) => itemOf(line, reading))} />
);

// A group saved before its lines were added has nothing to show yet.
const groupsWithLines = (recipe: Recipe) => recipe.ingredient_groups.filter(({ lines }) => lines.length > 0);

export const hasIngredients = (recipe: Recipe) =>
  recipe.ingredient_lines.length > 0 || groupsWithLines(recipe).length > 0;

const linesOf = (recipe: Recipe) => [
  ...recipe.ingredient_lines,
  ...groupsWithLines(recipe).flatMap((group) => group.lines)
];

// Stays while pressed, so it can always be turned off again.
export const canShowOriginal = (recipe: Recipe, reading: Reading) =>
  hasIngredients(recipe) &&
  (reading.showOriginal || linesOf(recipe).some((line) => differsFromOriginal(line, reading)));

// Offered whatever its state, so it shows only while turning it off or on would change an amount.
export const canCrossDimensions = (recipe: Recipe, reading: Reading) =>
  linesOf(recipe).some(
    (line) =>
      amountOf(line, { ...reading, crossesDimensions: true }) !==
      amountOf(line, { ...reading, crossesDimensions: false })
  );

type RecipeIngredientsProps = { recipe: Recipe; reading: Reading };

export const RecipeIngredients = ({ recipe, reading }: RecipeIngredientsProps) => {
  const headingId = useId();
  const isLaptop = useMediaQuery(isLaptopQuery);
  if (!hasIngredients(recipe)) {
    return null;
  }
  return (
    // On a laptop the ingredients stay in view and scroll inside themselves when taller than the window, so the
    // keyboard needs to reach the scroll region (WCAG 2.1.1).
    <section
      aria-labelledby={headingId}
      tabIndex={isLaptop ? 0 : undefined}
      className="flex flex-col gap-4 self-start lg:sticky lg:top-6 lg:col-start-1 lg:row-start-2 lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto"
    >
      <h2 id={headingId}>Ingredients</h2>
      {recipe.ingredient_lines.length > 0 && <IngredientLines lines={recipe.ingredient_lines} reading={reading} />}
      {groupsWithLines(recipe).map((group) => (
        <div key={group.id} className="flex flex-col gap-2">
          <h3 className="break-words">{group.name}</h3>
          <IngredientLines lines={group.lines} reading={reading} />
        </div>
      ))}
    </section>
  );
};
