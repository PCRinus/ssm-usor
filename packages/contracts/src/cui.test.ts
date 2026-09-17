import { describe, expect, it } from 'vitest';

import { cuiControlDigit, formatCui, isValidCui, isValidCuiInput, normalizeCui } from './cui';

describe('CUI checksum', () => {
  // Public identifiers of well-known companies.
  it.each(['1590082', '5022670', '14399840', '361536'])('accepts %s', (cui) => {
    expect(isValidCui(cui)).toBe(true);
  });

  it.each(['1590083', '0590082', '1', 'abc', '12345678901', ''])('rejects %s', (cui) => {
    expect(isValidCui(cui)).toBe(false);
  });

  it('maps a remainder of ten to a zero control digit', () => {
    // Weighted sum 1 gives (1 * 10) % 11 = 10, which the algorithm maps to 0.
    expect(cuiControlDigit('10000')).toBe(0);
    expect(isValidCui('100000')).toBe(true);
  });
});

describe('CUI normalization', () => {
  it.each([
    ['RO1590082', { cui: '1590082', vatPrefix: true }],
    ['ro 1590082', { cui: '1590082', vatPrefix: true }],
    ['1 590 082', { cui: '1590082', vatPrefix: false }],
    ['1590082', { cui: '1590082', vatPrefix: false }],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeCui(input)).toEqual(expected);
  });

  it.each(['RO', 'R01590082', '15900x82', 'DE1590082'])('rejects %s', (input) => {
    expect(normalizeCui(input)).toBeNull();
    expect(isValidCuiInput(input)).toBe(false);
  });

  it('formats with the VAT prefix only for VAT payers', () => {
    expect(formatCui('1590082', true)).toBe('RO1590082');
    expect(formatCui('1590082', false)).toBe('1590082');
  });
});
