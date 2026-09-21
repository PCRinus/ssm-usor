import { describe, expect, it } from 'vitest';

import { formatIban, isValidIban, normalizeIban } from './iban';

describe('IBAN', () => {
  it('accepts valid accounts, however they are spaced or cased', () => {
    expect(isValidIban('RO49AAAA1B31007593840000')).toBe(true);
    expect(isValidIban('ro49 aaaa 1b31 0075 9384 0000')).toBe(true);
    expect(isValidIban('DE89370400440532013000')).toBe(true);
  });

  it('refuses a wrong check digit, a wrong shape, and nothing at all', () => {
    expect(isValidIban('RO48AAAA1B31007593840000')).toBe(false);
    expect(isValidIban('RO49AAAA1B3100759384000!')).toBe(false);
    expect(isValidIban('49AAAA1B31007593840000')).toBe(false);
    expect(isValidIban('')).toBe(false);
  });

  it('stores it bare and prints it in groups of four', () => {
    expect(normalizeIban(' ro49 aaaa 1b31 0075 9384 0000 ')).toBe('RO49AAAA1B31007593840000');
    expect(formatIban('RO49AAAA1B31007593840000')).toBe('RO49 AAAA 1B31 0075 9384 0000');
  });
});
