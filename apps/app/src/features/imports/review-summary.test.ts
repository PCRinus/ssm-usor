import { describe, expect, it } from 'vitest';

import type { Blocker } from './review-model';
import { blockerHeading } from './review-summary';

const blockers = (code: Blocker['code'], count: number) =>
  Array.from({ length: count }, (_, index) => ({ path: `${code}.${index}`, code }));

describe('blockerHeading', () => {
  it('counts what is left with the "de" Romanian takes from 20 up', () => {
    expect(
      blockerHeading([
        ...blockers('choice', 25),
        ...blockers('missing', 2),
        ...blockers('invalid', 120),
      ])
    ).toEqual({
      heading: 'Mai ai 25 de alegeri, 2 date obligatorii și 120 de valori de corectat',
      resolve: 'Rezolvă cele 25 de alegeri, cele 2 date lipsă și cele 120 de valori greșite',
    });
  });
});
