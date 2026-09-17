import { describe, expect, it } from 'vitest';

import {
  cnpControlDigit,
  decodeCnp,
  isValidCnp,
  isValidCnpInput,
  maskCnp,
  normalizeCnp,
} from './cnp';

describe('CNP checksum and date', () => {
  it.each([
    '1900101400127', // male born 1990-01-01
    '2851217400058', // female born 1985-12-17
    '5040229123456', // 2004 is a leap year
    '5000229123453', // 2000 is a leap year
    '3800501123459', // born 1880
    '7900305100018', // foreign resident, century unknown
    '9000101000011', // foreign national
  ])('accepts %s', (cnp) => {
    expect(isValidCnp(cnp)).toBe(true);
  });

  it.each([
    ['1900101400128', 'wrong control digit'],
    ['0900101400127', 'leading zero'],
    ['190010140012', 'twelve digits'],
    ['19001014001270', 'fourteen digits'],
    ['1990229123457', '1999 is not a leap year'],
    ['1000229123456', '1900 is not a leap year'],
    ['6111308030011', 'month 13'],
    ['1022912345671', 'month 29'],
    ['abcdefghijklm', 'letters'],
    ['', 'empty'],
  ])('rejects %s (%s)', (cnp) => {
    expect(isValidCnp(cnp)).toBe(false);
  });

  it('maps a remainder of ten to a control digit of one', () => {
    // 2 * 5 = 10 with every other digit zero.
    expect(cnpControlDigit('500000000000')).toBe(1);
  });
});

describe('CNP normalization', () => {
  it.each([
    ['1900101400127', '1900101400127'],
    ['1 900101 400127', '1900101400127'],
    ['1900101-400127', '1900101400127'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeCnp(input)).toBe(expected);
    expect(isValidCnpInput(input)).toBe(true);
  });

  it.each(['RO1900101400127', '190010140012', '1900101400127x'])('rejects %s', (input) => {
    expect(normalizeCnp(input)).toBeNull();
    expect(isValidCnpInput(input)).toBe(false);
  });
});

describe('CNP decoding', () => {
  it.each([
    ['1900101400127', { birthDate: '1990-01-01', sex: 'male' }],
    ['2851217400058', { birthDate: '1985-12-17', sex: 'female' }],
    ['3800501123459', { birthDate: '1880-05-01', sex: 'male' }],
    ['5040229123456', { birthDate: '2004-02-29', sex: 'male' }],
    ['7900305100018', { birthDate: null, sex: 'male' }],
    ['9000101000011', { birthDate: null, sex: null }],
  ])('decodes %s', (cnp, expected) => {
    expect(decodeCnp(cnp)).toEqual(expected);
  });

  it('masks all but the last four digits', () => {
    expect(maskCnp('1900101400127')).toBe('•••••••••0127');
  });
});
