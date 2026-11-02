import { categoryFitsDomain } from '@ssm-usor/contracts';
import { describe, expect, it } from 'vitest';

import { fireInstructionsFor, instructionsFor, readFixtures } from './seed-instruction-modules';

describe('the fixture modules', () => {
  it('are bodies the schema accepts, each of a category of its domain, and every one the seed applies', async () => {
    const fixtures = await readFixtures();
    for (const fixture of fixtures)
      expect(categoryFitsDomain(fixture.group, fixture.domain)).toBe(true);
    const titles = fixtures.map((fixture) => fixture.title);
    for (const title of ['Zidar', 'Agent curățenie', 'Gestionar', 'Contabil'].flatMap(
      (job) => (instructionsFor(job) as string[]) ?? []
    )) {
      expect(titles).toContain(title);
    }
    expect(titles).toContain('Lucrul cu foc deschis');
  });
});

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
