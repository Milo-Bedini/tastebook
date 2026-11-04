import type { components } from '../api/schema';

type Unit = components['schemas']['UnitEnum'];
type IngredientLine = components['schemas']['IngredientLine'];

// Metric and imperial abbreviations stay the same for any amount; count units take a plural above 1.
const unitNames: Record<Unit, { one: string; many: string }> = {
  g: { one: 'g', many: 'g' },
  kg: { one: 'kg', many: 'kg' },
  ml: { one: 'ml', many: 'ml' },
  l: { one: 'l', many: 'l' },
  tsp: { one: 'tsp', many: 'tsp' },
  tbsp: { one: 'tbsp', many: 'tbsp' },
  cup: { one: 'cup', many: 'cups' },
  oz: { one: 'oz', many: 'oz' },
  lb: { one: 'lb', many: 'lb' },
  fl_oz: { one: 'fl oz', many: 'fl oz' },
  pinch: { one: 'pinch', many: 'pinches' },
  clove: { one: 'clove', many: 'cloves' },
  tin: { one: 'tin', many: 'tins' },
  slice: { one: 'slice', many: 'slices' },
  bunch: { one: 'bunch', many: 'bunches' },
  handful: { one: 'handful', many: 'handfuls' }
};

// Every unit, in the order Tastebook lists them.
export const units = Object.keys(unitNames) as Unit[];

// A unit as the recipe page writes one of it.
export const unitLabel = (unit: Unit) => unitNames[unit].one;

const number = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 3 });

type Quantity = Pick<IngredientLine, 'amount' | 'amount_max' | 'unit'>;

// "2–3 tbsp", "200 g", "2", or '' for an amount like "to taste".
export const formatQuantity = ({ amount, amount_max, unit }: Quantity) => {
  if (amount === null) {
    return unit === '' ? '' : unitNames[unit].one;
  }
  const amountText =
    amount_max === null ? number.format(amount) : `${number.format(amount)}–${number.format(amount_max)}`;
  if (unit === '') {
    return amountText;
  }
  const names = unitNames[unit];
  return `${amountText} ${(amount_max ?? amount) > 1 ? names.many : names.one}`;
};
