import { describe, expect, it } from 'vitest';

import { choiceAmounts, choiceSummary, formatEuro } from './billing-format';

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
