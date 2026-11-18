import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { storedList, storedRunErrorsSchema } from './stored';

describe('storedList', () => {
  const numbers = storedList(z.number());

  it('keeps the elements it can read and drops the rest', () => {
    expect(numbers.parse([1, 'two', 3, null])).toEqual([1, 3]);
  });

  it('reads a column that holds no list as an empty one', () => {
    expect(numbers.parse(null)).toEqual([]);
    expect(numbers.parse('not a list')).toEqual([]);
    expect(numbers.parse({ 0: 1 })).toEqual([]);
  });
});

describe('a stored run error', () => {
  it('reads one written before errors had a kind as another failure', () => {
    expect(
      storedRunErrorsSchema.parse([{ act: 'hg-1425-2006', message: 'Answered 503.' }])
    ).toEqual([{ act: 'hg-1425-2006', kind: 'other', message: 'Answered 503.' }]);
  });
});
