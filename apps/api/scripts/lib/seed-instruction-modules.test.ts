import { describe, expect, it } from 'vitest';

import { instructionsFor } from './seed-instruction-modules';

describe('instructionsFor', () => {
  it('gives a trade its modules and office posts the office module', () => {
    expect(instructionsFor('Zidar')).toEqual(['Scări metalice']);
    expect(instructionsFor('Contabil')).toEqual(['Activități de birou']);
  });

  it('leaves unknown titles undecided', () => {
    expect(instructionsFor('Astronaut')).toBeNull();
  });
});
