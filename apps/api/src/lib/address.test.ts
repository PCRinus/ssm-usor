import { describe, expect, it } from 'vitest';

import { printedAddress } from './address';

const inCapital = (locality: string | null) =>
  printedAddress({ countyCode: 'B', locality, addressLine: 'Str. Industriilor nr. 14' });

describe('an address in words', () => {
  it('puts the capital in front of a sector', () => {
    expect(inCapital('Sectorul 3')).toBe('București, Sectorul 3, Str. Industriilor nr. 14');
    expect(inCapital('Sector 3')).toBe('București, Sector 3, Str. Industriilor nr. 14');
  });

  it('does not repeat the capital when the locality names it, with or without diacritics', () => {
    expect(inCapital('București')).toBe('București, Str. Industriilor nr. 14');
    expect(inCapital('Municipiul București')).toBe(
      'Municipiul București, Str. Industriilor nr. 14'
    );
    expect(inCapital('Sector 1 Mun. Bucureşti')).toBe(
      'Sector 1 Mun. Bucureşti, Str. Industriilor nr. 14'
    );
    expect(inCapital('BUCURESTI')).toBe('BUCURESTI, Str. Industriilor nr. 14');
  });

  it('prints the capital alone without a locality', () => {
    expect(inCapital(null)).toBe('București, Str. Industriilor nr. 14');
    expect(inCapital('')).toBe('București, Str. Industriilor nr. 14');
  });

  it('names the county elsewhere', () => {
    expect(
      printedAddress({ countyCode: 'TM', locality: 'Ghiroda', addressLine: 'Str. Industriilor 4' })
    ).toBe('Ghiroda, județul Timiș, Str. Industriilor 4');
    expect(printedAddress({ countyCode: null, locality: null, addressLine: null })).toBe('');
  });
});
