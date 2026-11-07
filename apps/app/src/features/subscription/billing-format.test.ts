import { describe, expect, it } from 'vitest';

import {
  choiceAmounts,
  choiceSummary,
  employeesLabel,
  formatCount,
  formatEuro,
  packsLabel,
  packsNeeded,
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
    const amounts = choiceAmounts({
      plan: 'profesional',
      interval: 'year',
      employeePacks: 1,
      extraMembers: 1,
    });
    expect(amounts.lines.map((line) => [line.label, line.amountCents])).toEqual([
      ['Profesional, anual', 149000],
      ['1 pachet de 500 de lucrători', 40000],
      ['1 utilizator în plus', 15000],
    ]);
    expect(amounts).toMatchObject({ subtotalCents: 204000, vatCents: 42840, totalCents: 246840 });
  });

  it('counts the packs a plan needs', () => {
    expect(packsNeeded('start', 250)).toBe(0);
    expect(packsNeeded('start', 312)).toBe(2);
    expect(packsNeeded('profesional', 1740)).toBe(1);
    expect(packsLabel('start', 2)).toBe('2 pachete de câte 50 de lucrători');
  });

  it('sums up a choice in a line', () => {
    expect(
      choiceSummary({ plan: 'start', interval: 'month', employeePacks: 2, extraMembers: 1 })
    ).toBe('Start, lunar, cu 2 pachete și 1 utilizator în plus');
    expect(
      choiceSummary({ plan: 'profesional', interval: 'year', employeePacks: 0, extraMembers: 0 })
    ).toBe('Profesional, anual');
  });
});
