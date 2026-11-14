import { describe, expect, it } from 'vitest';

import {
  choiceAmounts,
  choiceSummary,
  employeesLabel,
  formatCount,
  formatEuro,
} from './billing-format';

describe('billing format', () => {
  it.each([
    [3900, '39 €'],
    [8349, '83,49 €'],
    [246840, '2.468,40 €'],
    [149000, '1.490 €'],
    [5, '0,05 €'],
    [-8349, '-83,49 €'],
  ])('writes %i cents as %s', (cents, text) => {
    expect(formatEuro(cents)).toBe(text);
  });

  it('groups thousands from four digits', () => {
    expect(formatCount(312)).toBe('312');
    expect(formatCount(1740)).toBe('1.740');
    expect(formatCount(12500)).toBe('12.500');
  });

  it.each([
    [0, '0 lucrători'],
    [1, '1 lucrător'],
    [2, '2 lucrători'],
    [19, '19 lucrători'],
    [20, '20 de lucrători'],
    [101, '101 lucrători'],
    [120, '120 de lucrători'],
    [1500, '1.500 de lucrători'],
  ])('counts %i employees as %s', (count, text) => {
    expect(employeesLabel(count)).toBe(text);
  });

  it('prices a choice as the API does, VAT rounded to the cent', () => {
    const amounts = choiceAmounts({ plan: 'profesional', step: 1000, interval: 'year' });
    expect(amounts.lines.map((line) => [line.label, line.amountCents])).toEqual([
      ['Profesional, până la 1.000 de lucrători, anual', 118800],
    ]);
    expect(amounts).toMatchObject({ subtotalCents: 118800, vatCents: 24948, totalCents: 143748 });
  });

  it('sums up a choice in a line', () => {
    expect(choiceSummary({ plan: 'start', step: 500, interval: 'month' })).toBe(
      'Start, până la 500 de lucrători, lunar'
    );
  });
});
