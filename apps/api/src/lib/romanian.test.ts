import { describe, expect, it } from 'vitest';

import { countOf, listed } from './romanian';

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
