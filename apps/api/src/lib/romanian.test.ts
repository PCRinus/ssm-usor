import { describe, expect, it } from 'vitest';

import { countOf, listed, runOn, withoutFinalStop } from './romanian';

describe('a count in words', () => {
  it('puts "de" between a number and its noun from 20 on, except 101 to 119 and the like', () => {
    const months = (count: number) => countOf(count, 'lună', 'luni');
    expect([1, 2, 19, 20, 21, 23, 100, 101, 119, 120].map(months)).toEqual([
      '1 lună',
      '2 luni',
      '19 luni',
      '20 de luni',
      '21 de luni',
      '23 de luni',
      '100 de luni',
      '101 luni',
      '119 luni',
      '120 de luni',
    ]);
  });
});

describe('a list in words', () => {
  it('joins the last item with "și" and the others with commas', () => {
    expect(listed([])).toBe('');
    expect(listed(['Ion POP'])).toBe('Ion POP');
    expect(listed(['Ion POP', 'Ana RUS'])).toBe('Ion POP și Ana RUS');
    expect(listed(['Ion POP', 'Ana RUS', 'Dan MARIN'])).toBe('Ion POP, Ana RUS și Dan MARIN');
  });
});

describe('a value inside a sentence', () => {
  it('starts in lower case where it was typed with a capital to stand alone', () => {
    expect(runOn('Mecanic auto')).toBe('mecanic auto');
    expect(runOn('Întreținerea și repararea autovehiculelor')).toBe(
      'întreținerea și repararea autovehiculelor'
    );
    expect(runOn('administrator')).toBe('administrator');
  });

  it('keeps an acronym, a single letter and an empty value as they are', () => {
    expect(runOn('PSI și SSM')).toBe('PSI și SSM');
    expect(runOn('ISU Brașov')).toBe('ISU Brașov');
    expect(runOn('A')).toBe('A');
    expect(runOn('A. Vopsitorie')).toBe('A. Vopsitorie');
    expect(runOn('')).toBe('');
  });
});

describe('a value listed as an item', () => {
  it('drops its final full stop or semicolon, and keeps an ellipsis', () => {
    expect(withoutFinalStop('Cartoane, hârtie.')).toBe('Cartoane, hârtie');
    expect(withoutFinalStop('Cartoane, hârtie;')).toBe('Cartoane, hârtie');
    expect(withoutFinalStop('Cartoane, hârtie')).toBe('Cartoane, hârtie');
    expect(withoutFinalStop('Cartoane, hârtie etc...')).toBe('Cartoane, hârtie etc...');
  });
});
