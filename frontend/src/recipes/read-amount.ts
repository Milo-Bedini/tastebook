export type AmountReading =
  | { kind: 'amount'; amount: number | null; amountMax: number | null }
  | { kind: 'unreadable' }
  | { kind: 'zero' }
  | { kind: 'falling' };

const vulgarFractions: Record<string, number> = {
  '¼': 1 / 4,
  '½': 1 / 2,
  '¾': 3 / 4,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '⅕': 1 / 5,
  '⅖': 2 / 5,
  '⅗': 3 / 5,
  '⅘': 4 / 5,
  '⅙': 1 / 6,
  '⅚': 5 / 6,
  '⅛': 1 / 8,
  '⅜': 3 / 8,
  '⅝': 5 / 8,
  '⅞': 7 / 8
};

const vulgar = Object.keys(vulgarFractions).join('');

// The API keeps 3 decimal places and 8 digits.
const LARGEST = 99999.999;

const fraction = (numerator: string, denominator: string) =>
  Number(denominator) === 0 ? null : Number(numerator) / Number(denominator);

// Each form a single number takes, and its value; null when the form matches but means nothing (1/0).
const numberForms: [RegExp, (match: RegExpMatchArray) => number | null][] = [
  [/^\d+(?:\.\d+)?$/, ([whole]) => Number(whole)],
  [/^(\d+)\/(\d+)$/, ([, numerator = '', denominator = '']) => fraction(numerator, denominator)],
  [
    new RegExp(`^(?:(\\d+)\\s*)?([${vulgar}])$`, 'u'),
    ([, whole = '0', part = '']) => Number(whole) + (vulgarFractions[part] ?? 0)
  ],
  [
    /^(\d+)\s+(\d+)\/(\d+)$/,
    ([, whole = '', numerator = '', denominator = '']) => {
      const part = fraction(numerator, denominator);
      return part === null ? null : Number(whole) + part;
    }
  ]
];

const readNumber = (text: string): number | null => {
  const value = numberForms
    .map(([form, read]) => {
      const match = text.match(form);
      return match === null ? null : read(match);
    })
    .find((found) => found !== null);
  if (value === undefined || value === null) {
    return null;
  }
  const rounded = Math.round(value * 1000) / 1000;
  return rounded > LARGEST ? null : rounded;
};

const range = /^(.+?)\s*(?:[-–—]|\bto\b)\s*(.+)$/u;

// What someone typed in a line's Amount: "2", "2.5", "½", "1½", "1 1/2", "2-3", "2 to 3", or nothing for "to taste".
export const readAmount = (text: string): AmountReading => {
  const trimmed = text.trim();
  if (trimmed === '') {
    return { kind: 'amount', amount: null, amountMax: null };
  }
  const ends = trimmed.match(range);
  const [low, high] = ends === null ? [trimmed, undefined] : [ends[1] ?? '', ends[2]];
  const amount = readNumber(low);
  const amountMax = high === undefined ? null : readNumber(high);
  if (amount === null || (high !== undefined && amountMax === null)) {
    return { kind: 'unreadable' };
  }
  if (amount === 0 || amountMax === 0) {
    return { kind: 'zero' };
  }
  if (amountMax !== null && amountMax < amount) {
    return { kind: 'falling' };
  }
  return { kind: 'amount', amount, amountMax: amountMax === amount ? null : amountMax };
};

// A line's amount as the form shows it: "2", "0.5", "2-3", or '' for none.
export const amountText = (amount: number | null, amountMax: number | null): string => {
  if (amount === null) {
    return '';
  }
  return amountMax === null ? String(amount) : `${amount}-${amountMax}`;
};
