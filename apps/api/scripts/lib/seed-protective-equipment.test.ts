import { describe, expect, it } from 'vitest';

import { equipmentFor } from './seed-protective-equipment';

describe('equipmentFor', () => {
  it('gives a trade its entries, inventory with a duration and consumables without', () => {
    const entries = equipmentFor('Sudor');
    expect(entries).not.toBe('none');
    expect(entries).not.toBeNull();
    for (const entry of entries as Exclude<typeof entries, 'none' | null>) {
      expect(entry.allocation === 'consumable').toBe(entry.duration_months === null);
      expect(entry.quantity).toBeGreaterThanOrEqual(1);
    }
  });

  it('decides that office posts need none, and leaves unknown titles undecided', () => {
    expect(equipmentFor('Contabil')).toBe('none');
    expect(equipmentFor('Astronaut')).toBeNull();
  });
});
