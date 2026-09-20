import { describe, expect, it } from 'vitest';

import { localityFilter } from './locality-filter';
import { localityItems } from './locality-items';

describe('locality items', () => {
  it('prints the commune beside a name several localities of the county share', () => {
    const items = localityItems([
      ['Valea Mare', 'com. Priboieni'],
      ['Valea Mare', 'com. Ștefănești'],
      ['Priboieni', 'com. Priboieni'],
    ]);
    expect(items.map((item) => item.value)).toEqual([
      'Valea Mare (com. Priboieni)',
      'Valea Mare (com. Ștefănești)',
      'Priboieni',
    ]);
    expect(items[0]).toMatchObject({ label: 'Valea Mare', description: 'com. Priboieni' });
  });
});

describe('locality filter', () => {
  it('finds a name without its diacritics, from its start or from any word', () => {
    expect(localityFilter('Bărăbanț|mun. Alba Iulia', 'barab')).toBe(1);
    expect(localityFilter('Alba Iulia|mun. Alba Iulia', 'iul')).toBe(0.8);
    expect(localityFilter('Piatra-Neamț|mun. Piatra-Neamț', 'neamt')).toBe(0.8);
    expect(localityFilter('Sectorul 3|mun. București', 'sector 3')).toBe(0.8);
    expect(localityFilter('Sectorul 2|mun. București', 'sector 3')).toBe(0);
  });

  it('finds the villages of a commune by the commune, after the names themselves', () => {
    expect(localityFilter('Acmariu|com. Blandiana', 'bland')).toBe(0.5);
    expect(localityFilter('Acmariu|com. Blandiana', 'com')).toBe(0);
    expect(localityFilter('Acmariu|com. Blandiana', 'xyz')).toBe(0);
  });
});
