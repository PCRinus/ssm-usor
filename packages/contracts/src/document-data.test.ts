import { describe, expect, it } from 'vitest';

import {
  formatTrainingDuration,
  periodicTrainingMinutesOptions,
  requiredWorkersRepresentatives,
  responsiblePersonRequestSchema,
  samePersonName,
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

describe('formatTrainingDuration', () => {
  it('reads as the first decision prints it', () => {
    expect(periodicTrainingMinutesOptions.map(formatTrainingDuration)).toEqual([
      '30 de minute',
      '1 oră',
      '1 oră și 30 de minute',
      '2 ore',
    ]);
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

  it('takes a periodic training of half an hour to two hours, in half hours', () => {
    const parse = (body: object) => updateClientDocumentDetailsRequestSchema.safeParse(body);
    for (const minutes of [30, 60, 90, 120]) {
      expect(parse({ periodicTrainingMinutes: minutes }).success).toBe(true);
    }
    for (const minutes of [0, 45, 150, 180]) {
      expect(parse({ periodicTrainingMinutes: minutes }).success).toBe(false);
    }
  });

  it('stops the worker interval at six months and the administrative one at twelve', () => {
    const parse = (body: object) => updateClientDocumentDetailsRequestSchema.safeParse(body);
    expect(parse({ workerTrainingIntervalMonths: 6 }).success).toBe(true);
    expect(parse({ workerTrainingIntervalMonths: 7 }).success).toBe(false);
    expect(parse({ administrativeTrainingIntervalMonths: 12 }).success).toBe(true);
    expect(parse({ administrativeTrainingIntervalMonths: 13 }).success).toBe(false);
  });

  it('keeps an excluded category separate from an interval', () => {
    const parse = (body: object) => updateClientDocumentDetailsRequestSchema.safeParse(body);
    expect(parse({ workerTrainingNotApplicable: true }).success).toBe(true);
    expect(
      parse({ workerTrainingNotApplicable: true, workerTrainingIntervalMonths: 3 }).success
    ).toBe(false);
    expect(
      parse({ administrativeTrainingNotApplicable: true, administrativeTrainingIntervalMonths: 6 })
        .success
    ).toBe(false);
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

  it("takes a workers' representative only from the employees", () => {
    const parse = (employeeId: string | null) =>
      responsiblePersonRequestSchema.safeParse({
        ...person,
        employeeId,
        roles: ['workers_representative'],
      });
    expect(parse('0b8a3a39-7a55-4c7e-9a07-1f3c8f3a3c11').success).toBe(true);
    expect(parse(null).error?.issues[0]?.path).toEqual(['employeeId']);
  });
});

describe('samePersonName', () => {
  it('ignores order, case, diacritics and hyphens', () => {
    expect(samePersonName('Florin Cristian TALOȘ', 'talos florin-cristian')).toBe(true);
    expect(samePersonName('  Ana  Pop ', 'POP ANA')).toBe(true);
  });

  it('tells different people apart', () => {
    expect(samePersonName('Ana Pop', 'Ana Popa')).toBe(false);
    expect(samePersonName('Ana Pop', 'Ana Maria Pop')).toBe(false);
  });
});

describe('requiredWorkersRepresentatives', () => {
  it('asks for none under 10, one from 10 and two from 50', () => {
    expect([0, 9, 10, 49, 50, 100].map(requiredWorkersRepresentatives)).toEqual([0, 0, 1, 1, 2, 2]);
  });
});
