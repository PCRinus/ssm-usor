import { describe, expect, it } from 'vitest';

import { formatNumber } from './docx-numbering';

describe('formatNumber', () => {
  it('writes a number in each format Word prints', () => {
    expect(formatNumber(14, 'decimal')).toBe('14');
    expect(formatNumber(7, 'decimalZero')).toBe('07');
    expect(formatNumber(3, 'lowerLetter')).toBe('c');
    expect(formatNumber(28, 'lowerLetter')).toBe('bb');
    expect(formatNumber(53, 'upperLetter')).toBe('AAA');
    expect(formatNumber(14, 'lowerRoman')).toBe('xiv');
    expect(formatNumber(1949, 'upperRoman')).toBe('MCMXLIX');
    expect(formatNumber(5, 'ordinal')).toBe('5');
    expect(formatNumber(5, 'none')).toBe('');
  });

  it('writes a letter number past the last one Word prints as digits', () => {
    expect(formatNumber(780, 'lowerLetter')).toBe('z'.repeat(30));
    expect(formatNumber(2_000_000_000, 'lowerLetter')).toBe('2000000000');
  });
});
