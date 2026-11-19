import { describe, expect, it } from 'vitest';

import { oneOf, pageParam } from './search';

describe('oneOf', () => {
  it('keeps a listed value and drops anything else', () => {
    const kinds = ['risks', 'instructions'] as const;
    expect(oneOf(kinds, 'risks')).toBe('risks');
    expect(oneOf(kinds, 'employees')).toBeUndefined();
    expect(oneOf(kinds, 1)).toBeUndefined();
    expect(oneOf(kinds, undefined)).toBeUndefined();
  });
});

describe('pageParam', () => {
  it('keeps a page after the first and leaves the first out of the address', () => {
    expect(pageParam(3)).toBe(3);
    expect(pageParam('2')).toBe(2);
    expect(pageParam(1)).toBeUndefined();
    expect(pageParam(0)).toBeUndefined();
    expect(pageParam(2.5)).toBeUndefined();
    expect(pageParam('abc')).toBeUndefined();
    expect(pageParam(undefined)).toBeUndefined();
  });
});
