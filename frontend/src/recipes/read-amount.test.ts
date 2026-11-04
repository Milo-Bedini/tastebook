import { describe, expect, it } from 'vitest';

import { type AmountReading, amountText, readAmount } from './read-amount';

const amount = (low: number | null, high: number | null): AmountReading => ({
  kind: 'amount',
  amount: low,
  amountMax: high
});

describe('readAmount', () => {
  it.each<[string, AmountReading]>([
    ['2', amount(2, null)],
    ['2.5', amount(2.5, null)],
    ['½', amount(0.5, null)],
    ['1½', amount(1.5, null)],
    ['1 ½', amount(1.5, null)],
    ['1/2', amount(0.5, null)],
    ['1 1/2', amount(1.5, null)],
    ['⅓', amount(0.333, null)],
    ['2-3', amount(2, 3)],
    ['2 – 3', amount(2, 3)],
    ['2 to 3', amount(2, 3)],
    ['½-1', amount(0.5, 1)],
    ['2-2', amount(2, null)],
    ['', amount(null, null)],
    ['   ', amount(null, null)],
    ['0', { kind: 'zero' }],
    ['0-2', { kind: 'zero' }],
    ['3-2', { kind: 'falling' }],
    ['a pinch', { kind: 'unreadable' }],
    ['2,5', { kind: 'unreadable' }],
    ['1/0', { kind: 'unreadable' }],
    ['100000', { kind: 'unreadable' }]
  ])('reads "%s"', (text, expected) => {
    expect(readAmount(text)).toEqual(expected);
  });
});

describe('amountText', () => {
  it.each<[number | null, number | null, string]>([
    [2, null, '2'],
    [0.5, null, '0.5'],
    [2, 3, '2-3'],
    [null, null, '']
  ])('writes %s up to %s as "%s"', (low, high, expected) => {
    expect(amountText(low, high)).toBe(expected);
  });
});
