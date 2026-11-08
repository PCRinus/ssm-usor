import { describe, expect, it } from 'vitest';

import {
  importedTrainingInterval,
  offeredTrainingInterval,
  postsAfterImport,
  staffCategoriesWithPosts,
  startingTrainingIntervals,
  trainingIntervalChoices,
} from './training-categories';

const cook = {
  id: 'b1c2d3e4-0000-4000-8000-000000000001',
  name: 'Bucătar',
  staffCategory: 'execution',
} as const;

describe('the posts a client holds after an import', () => {
  it("keeps a post's category when an imported one of the same name says another", () => {
    const posts = postsAfterImport(
      [cook],
      [{ name: ' bucătar ', staffCategory: 'technical_administrative' }]
    );
    expect(posts).toEqual([{ name: 'Bucătar', staffCategory: 'execution' }]);
    expect(staffCategoriesWithPosts(posts)).toEqual(['execution']);
  });

  it('takes the imported category only where the member matched the post and replaced it', () => {
    const imported = { name: 'Șef bucătar', staffCategory: 'technical_administrative' } as const;
    expect(
      postsAfterImport([cook], [{ ...imported, existingId: cook.id, replacesCategory: true }])
    ).toEqual([{ name: 'Bucătar', staffCategory: 'technical_administrative' }]);
    expect(postsAfterImport([cook], [{ ...imported, existingId: cook.id }])).toEqual([
      { name: 'Bucătar', staffCategory: 'execution' },
    ]);
    expect(postsAfterImport([cook], [{ ...imported, replacesCategory: true }])).toEqual([
      { name: 'Bucătar', staffCategory: 'execution' },
      imported,
    ]);
  });

  it('adds a post of no category as execution personnel, and a second of its name to the first', () => {
    expect(
      postsAfterImport(
        [],
        [
          { name: 'Ajutor', staffCategory: null },
          { name: 'ajutor', staffCategory: 'technical_administrative' },
        ]
      )
    ).toEqual([{ name: 'Ajutor', staffCategory: 'execution' }]);
  });
});

describe('the training intervals', () => {
  it('offer execution staff every month to six, and the database range to everyone but SSM administrative staff', () => {
    expect(trainingIntervalChoices.ssm.execution).toEqual([1, 2, 3, 4, 5, 6]);
    expect(trainingIntervalChoices.ssm.technical_administrative).toEqual([1, 2, 3, 4, 6, 12]);
    expect(trainingIntervalChoices.su.execution).toEqual([1, 2, 3, 4, 5, 6]);
    expect(trainingIntervalChoices.su.technical_administrative).toEqual([1, 2, 3, 4, 5, 6]);
    expect(offeredTrainingInterval('ssm', 'technical_administrative', 9)).toBe(false);
  });

  it('start SSM at the law’s longest and SU at three months for execution and six for the others', () => {
    expect(startingTrainingIntervals).toEqual({
      ssm: { execution: 6, technical_administrative: 12 },
      su: { execution: 3, technical_administrative: 6 },
    });
    for (const domain of ['ssm', 'su'] as const) {
      for (const category of ['execution', 'technical_administrative'] as const) {
        expect(
          offeredTrainingInterval(domain, category, startingTrainingIntervals[domain][category])
        ).toBe(true);
      }
    }
    expect(
      importedTrainingInterval({
        domain: 'su',
        category: 'execution',
        hasPosts: true,
        settled: null,
      })
    ).toEqual({ months: 3, starting: true });
  });
});
