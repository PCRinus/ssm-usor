import { describe, expect, it } from 'vitest';

import {
  responsiblePersonRequestSchema,
  trainingMonths,
  updateClientDocumentDetailsRequestSchema,
} from './document-data';

describe('trainingMonths', () => {
  it('starts at the first month and repeats by the interval until the year ends', () => {
    // The two sample documentation sets: February and August; January, April, July, October.
    expect(trainingMonths(2, 6)).toEqual([2, 8]);
    expect(trainingMonths(1, 3)).toEqual([1, 4, 7, 10]);
    expect(trainingMonths(2, 3)).toEqual([2, 5, 8, 11]);
  });

  it('gives one month for a yearly interval, and the rest of the year for a monthly one', () => {
    expect(trainingMonths(5, 12)).toEqual([5]);
    expect(trainingMonths(10, 1)).toEqual([10, 11, 12]);
  });
});

describe('updateClientDocumentDetailsRequestSchema', () => {
  it('accepts an empty body, which clears everything', () => {
    expect(updateClientDocumentDetailsRequestSchema.parse({})).toEqual({});
  });

  it('refuses days out of order, on the last day', () => {
    const result = updateClientDocumentDetailsRequestSchema.safeParse({
      trainingDayFrom: 12,
      trainingDayTo: 7,
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['trainingDayTo']);
  });

  it('stops the worker interval at six months and the administrative one at twelve', () => {
    const parse = (body: object) => updateClientDocumentDetailsRequestSchema.safeParse(body);
    expect(parse({ workerTrainingIntervalMonths: 6 }).success).toBe(true);
    expect(parse({ workerTrainingIntervalMonths: 7 }).success).toBe(false);
    expect(parse({ administrativeTrainingIntervalMonths: 12 }).success).toBe(true);
    expect(parse({ administrativeTrainingIntervalMonths: 13 }).success).toBe(false);
  });
});

describe('responsiblePersonRequestSchema', () => {
  const person = { fullName: 'Ion Popescu', jobTitle: 'Manager magazin' };

  it('needs at least one role, each given once', () => {
    const parse = (roles: string[]) =>
      responsiblePersonRequestSchema.safeParse({ ...person, roles });
    expect(parse(['workplace_manager', 'first_aid']).success).toBe(true);
    expect(parse([]).success).toBe(false);
    expect(parse(['first_aid', 'first_aid']).success).toBe(false);
  });
});
