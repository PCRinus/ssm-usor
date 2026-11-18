import { describe, expect, it } from 'vitest';

import type { ImportDetail } from '@/api/generated/api';
import { importDetail, proposalFixture } from '@/test/import-fixture';

import { type Blocker, noChanges } from './review-model';
import { blockerHeading, sectionDescription } from './review-summary';

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

describe("the posts another company's passages bring", () => {
  const describePositions = (proposal: ReturnType<typeof proposalFixture>) =>
    sectionDescription(
      'job-positions',
      importDetail() as unknown as ImportDetail,
      proposal,
      noChanges,
      {}
    );

  it('names a single one in the singular', () => {
    expect(describePositions(proposalFixture())).toContain(
      ' Un alt post apare doar în pasaje copiate de la altă firmă și rămâne deoparte.'
    );
  });

  it('names a fire-safety one, of whatever kind, as an element', () => {
    const proposal = proposalFixture();
    proposal.fireEquipment.push({
      ...proposal.fireEquipment[0]!,
      id: 'extinguisher-other',
      otherCompanyName: 'Lactate Câmpia SRL',
    });
    expect(
      sectionDescription(
        'fire-safety',
        importDetail() as unknown as ImportDetail,
        proposal,
        noChanges,
        {}
      )
    ).toContain(
      ' Un alt element apare doar în pasaje copiate de la altă firmă și rămâne deoparte.'
    );
  });

  it('counts several with the "de" Romanian takes from 20 up', () => {
    const proposal = proposalFixture();
    const other = proposal.jobPositions.find((position) => position.otherCompanyName !== null)!;
    proposal.jobPositions.push(
      ...Array.from({ length: 24 }, (_, index) => ({ ...other, id: `other-${index}` }))
    );
    expect(describePositions(proposal)).toContain(
      ' Alte 25 de posturi apar doar în pasaje copiate de la altă firmă și sunt lăsate deoparte.'
    );
  });
});
