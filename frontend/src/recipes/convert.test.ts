import { describe, expect, it } from 'vitest';

import { convert, convertTemperatures } from './convert';
import { formatQuantity } from './format-quantity';

describe('convert', () => {
  it.each([
    // Metric: small volumes read in spoons, whoever wrote them.
    [5, null, 'ml', 1, 'metric', '1 tsp'],
    [15, null, 'ml', 1, 'metric', '1 tbsp'],
    [7, null, 'ml', 1, 'metric', '1.5 tsp'],
    [45, null, 'ml', 1, 'metric', '3 tbsp'],
    [52, null, 'ml', 1, 'metric', '52 ml'],
    [1500, null, 'ml', 1, 'metric', '1.5 l'],
    // Metric keeps its own units as written, spoons included.
    [8, null, 'tbsp', 1, 'metric', '8 tbsp'],
    [0.5, null, 'tsp', 1, 'metric', '0.5 tsp'],
    [52, null, 'g', 1, 'metric', '52 g'],
    [1.2, null, 'kg', 1, 'metric', '1.2 kg'],
    [0.5, null, 'l', 1, 'metric', '0.5 l'],
    // US units read in metric within their dimension: a cup is 240 ml, never grams.
    [1, null, 'cup', 1, 'metric', '240 ml'],
    [0.25, null, 'cup', 1, 'metric', '60 ml'],
    [4, null, 'fl_oz', 1, 'metric', '120 ml'],
    [8, null, 'oz', 1, 'metric', '225 g'],
    [2.5, null, 'lb', 1, 'metric', '1.15 kg'],
    [1, null, 'oz', 1, 'metric', '28 g'],
    // US customary keeps its own units, spoons included.
    [4, null, 'fl_oz', 1, 'us', '4 fl oz'],
    [0.333, null, 'cup', 1, 'us', '0.333 cup'],
    [2, null, 'tbsp', 1, 'us', '2 tbsp'],
    [12, null, 'oz', 1, 'us', '12 oz'],
    // Metric units read in US customary within their dimension.
    [200, null, 'g', 1, 'us', '7 oz'],
    [125, null, 'g', 1, 'us', '4.5 oz'],
    [1, null, 'kg', 1, 'us', '2.25 lb'],
    [500, null, 'g', 1, 'us', '1 lb'],
    [500, null, 'ml', 1, 'us', '2 cups'],
    [60, null, 'ml', 1, 'us', '0.25 cup'],
    [30, null, 'ml', 1, 'us', '2 tbsp'],
    [5, null, 'ml', 1, 'us', '1 tsp'],
    [1, null, 'l', 1, 'us', '4.25 cups'],
    // Converted amounts scale first, then round once in the unit they read in.
    [150, null, 'ml', 1.5, 'metric', '225 ml'],
    [10, null, 'ml', 3, 'metric', '2 tbsp'],
    [1, null, 'cup', 7 / 6, 'metric', '280 ml'],
    [150, null, 'g', 2, 'us', '10.5 oz'],
    [300, null, 'g', 2, 'us', '1.25 lb'],
    [1, null, 'tsp', 1.5, 'metric', '1.5 tsp'],
    // A range picks its unit by its top end and rounds at both ends.
    [10, 20, 'ml', 1, 'metric', '0.75–1.25 tbsp'],
    [1, 2, 'cup', 1, 'metric', '240–480 ml'],
    [100, 150, 'g', 1, 'us', '3.5–5.25 oz'],
    // Count units, whole items and lines with no amount are never converted.
    [2, null, 'clove', 1, 'us', '2 cloves'],
    [1, null, 'pinch', 1, 'us', '1 pinch'],
    [1, null, 'tin', 1.5, 'us', '1–2 tins'],
    [3, null, 'slice', 1, 'us', '3 slices'],
    [1, null, 'bunch', 1, 'us', '1 bunch'],
    [1, null, 'handful', 1, 'metric', '1 handful'],
    [6, null, '', 1, 'us', '6'],
    [null, null, 'cup', 2, 'metric', 'cup'],
    [null, null, '', 1, 'us', '']
  ] as const)('reads %s up to %s %s by %d in %s as "%s"', (amount, amount_max, unit, factor, system, text) => {
    expect(formatQuantity(convert({ amount, amount_max, unit }, factor, system, null))).toBe(text);
  });

  it.each([
    // Metric: a dry good's cups and millilitres read as grams.
    [1, null, 'cup', 1, 'metric', 125, '125 g'],
    [0.5, null, 'cup', 1, 'metric', 125, '65 g'],
    [2, null, 'cup', 1, 'metric', 125, '250 g'],
    [10, null, 'cup', 1, 'metric', 125, '1.25 kg'],
    [100, null, 'ml', 1, 'metric', 125, '50 g'],
    [4, null, 'fl_oz', 1, 'metric', 200, '100 g'],
    // Metric: spoons stay spoons.
    [2, null, 'tbsp', 1, 'metric', 125, '2 tbsp'],
    [30, null, 'ml', 1, 'metric', 125, '2 tbsp'],
    // Metric: weight stays weight.
    [8, null, 'oz', 1, 'metric', 125, '225 g'],
    // US customary: a dry good's grams read as spoons and cups.
    [125, null, 'g', 1, 'us', 125, '1 cup'],
    [200, null, 'g', 1, 'us', 125, '1.5 cups'],
    [150, null, 'g', 1, 'us', 81, '1.75 cups'],
    [10, null, 'g', 1, 'us', 86, '1.75 tbsp'],
    [5, null, 'g', 1, 'us', 200, '1.25 tsp'],
    [1, null, 'kg', 1, 'us', 125, '8 cups'],
    // US customary keeps its own units and converts volume within volume.
    [4, null, 'oz', 1, 'us', 125, '4 oz'],
    [250, null, 'ml', 1, 'us', 125, '1 cup'],
    // Converted amounts scale first, then round once.
    [100, null, 'g', 1.5, 'us', 125, '1.25 cups'],
    // A range picks its unit by its top end.
    [1, 2, 'cup', 1, 'metric', 125, '125–250 g'],
    [100, 150, 'g', 1, 'us', 200, '0.5–0.75 cup'],
    // No weight per cup, count units and lines with no amount.
    [200, null, 'g', 1, 'us', null, '7 oz'],
    [1, null, 'cup', 1, 'metric', null, '240 ml'],
    [2, null, '', 1, 'us', 125, '2'],
    [null, null, 'cup', 2, 'metric', 125, 'cup']
  ] as const)(
    'reads %s up to %s %s by %d in %s at %s g a cup as "%s"',
    (amount, amount_max, unit, factor, system, gramsPerCup, text) => {
      expect(formatQuantity(convert({ amount, amount_max, unit }, factor, system, gramsPerCup))).toBe(text);
    }
  );
});

describe('convertTemperatures', () => {
  it.each([
    ['Heat the oven to 180°C (160°C fan).', 'us', 'Heat the oven to 355°F (320°F fan).'],
    ['Roast at 220 °C for 30 minutes.', 'us', 'Roast at 430°F for 30 minutes.'],
    ['Bake at 180–200°C until golden.', 'us', 'Bake at 355–390°F until golden.'],
    ['Bake at 180-200°C until golden.', 'us', 'Bake at 355–390°F until golden.'],
    ['Freeze at -18°C.', 'us', 'Freeze at 0°F.'],
    ['Heat the oven to 350°F.', 'metric', 'Heat the oven to 175°C.'],
    // Temperatures already in the system, and every other amount, stay as written.
    ['Heat the oven to 180°C and add 200 g of flour.', 'metric', 'Heat the oven to 180°C and add 200 g of flour.'],
    ['Heat the oven to 350°F and add 2 cups of flour.', 'us', 'Heat the oven to 350°F and add 2 cups of flour.'],
    ['Add 200 g of flour and simmer for 10 minutes.', 'us', 'Add 200 g of flour and simmer for 10 minutes.']
  ] as const)('reads "%s" in %s as "%s"', (text, system, converted) => {
    expect(convertTemperatures(text, system)).toBe(converted);
  });
});
