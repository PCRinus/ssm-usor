import { describe, expect, it } from 'vitest';

import { caenFilter } from './caen-filter';

describe('CAEN filter', () => {
  const software = '6210 Activități de realizare a soft-ului la comandă (software orientat client)';
  const oil = '0610 Extracția petrolului brut';

  it('ranks code prefixes above name matches and ignores diacritics', () => {
    expect(caenFilter(software, '62')).toBe(1);
    expect(caenFilter(software, '6210')).toBe(1);
    expect(caenFilter(oil, 'extractia')).toBe(0.8);
    expect(caenFilter(software, 'soft comanda')).toBe(0.5);
    expect(caenFilter(software, '')).toBe(1);
  });

  it('hides entries that match neither code nor every word', () => {
    expect(caenFilter(oil, '62')).toBe(0);
    expect(caenFilter(software, 'soft petrol')).toBe(0);
  });
});
