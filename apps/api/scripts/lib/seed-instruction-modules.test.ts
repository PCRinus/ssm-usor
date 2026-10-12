import { describe, expect, it } from 'vitest';

import { fireInstructionsFor, instructionsFor } from './seed-instruction-modules';

describe('instructionsFor', () => {
  it('gives a trade its modules and office posts the office module', () => {
    expect(instructionsFor('Zidar')).toEqual(['Scări metalice']);
    expect(instructionsFor('Contabil')).toEqual(['Activități de birou']);
  });

  it('leaves unknown titles undecided', () => {
    expect(instructionsFor('Astronaut')).toBeNull();
  });
});

describe('fireInstructionsFor', () => {
  it('gives the trades that work with flame the hot-work module and decides every other post', () => {
    expect(fireInstructionsFor('Sudor')).toEqual(['Lucrul cu foc deschis']);
    expect(fireInstructionsFor('Contabil')).toBe('none');
    expect(fireInstructionsFor('Astronaut')).toBe('none');
  });
});
