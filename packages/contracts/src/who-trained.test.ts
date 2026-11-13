import { describe, expect, it } from 'vitest';

import { employeeImportChangesSchema } from './imports';
import {
  answerPeriod,
  answerSplit,
  handoverDay,
  hasAnswer,
  rowSigner,
  typedOnRow,
  type WhoTrainedAnswer,
} from './who-trained';

const vasile = { name: 'Iordache Vasile', jobTitle: 'Șef de șantier' };
const pavel = { name: 'Pavel Mihai', jobTitle: 'Specialist SSM' };
const answer: WhoTrainedAnswer = {
  trainer: { before: pavel, from: vasile },
  verifier: { from: pavel },
};

describe('the period of a row', () => {
  it('is before the handover, from it on, or none for an undated row', () => {
    expect(answerPeriod('2022-10-02', '2022-10-03')).toBe('before');
    expect(answerPeriod('2022-10-03', '2022-10-03')).toBe('from');
    expect(answerPeriod('2023-01-01', '2022-10-03')).toBe('from');
    expect(answerPeriod(null, '2022-10-03')).toBeNull();
  });

  it('is the one answer for every dated row without a handover', () => {
    expect(answerPeriod('2010-01-01', null)).toBe('from');
  });

  it('splits at the person’s own handover, else at the one copied with the answer', () => {
    expect(answerSplit('2022-10-03', { splitOn: '2021-01-01' })).toBe('2022-10-03');
    expect(answerSplit(null, { splitOn: '2021-01-01' })).toBe('2021-01-01');
    expect(answerSplit(null, undefined)).toBeNull();
  });

  it('takes the latest handover of a person’s pages, each page repeating it or not', () => {
    expect(
      handoverDay([
        { handovers: [{ date: '2022-10-03' }] },
        { handovers: [{ date: '2022-10-03' }, { date: null }] },
        { handovers: [{ date: '2019-02-01' }] },
        {},
      ])
    ).toBe('2022-10-03');
    expect(handoverDay([{ handovers: [{ date: null }] }])).toBeNull();
  });
});

describe('a row’s signer', () => {
  const slot = (overrides: Partial<Parameters<typeof rowSigner>[0]>) =>
    rowSigner({
      domain: 'ssm',
      phase: 'periodic',
      role: 'trainer',
      name: null,
      jobTitle: null,
      typed: false,
      period: 'before',
      answer,
      ...overrides,
    });

  it('is the answer for the row’s period where the sheet names nobody', () => {
    expect(slot({})).toEqual({ ...pavel, source: 'answer' });
    expect(slot({ period: 'from' })).toEqual({ ...vasile, source: 'answer' });
    expect(slot({ role: 'verifier', period: 'from' })).toEqual({ ...pavel, source: 'answer' });
  });

  it('never replaces a name the sheet writes or one typed on the row', () => {
    expect(slot({ name: 'Barbu Ionuț', jobTitle: null })).toEqual({
      name: 'Barbu Ionuț',
      jobTitle: null,
      source: 'sheet',
    });
    expect(slot({ name: null, typed: true })).toEqual({
      name: null,
      jobTitle: null,
      source: 'row',
    });
  });

  it('stays empty for an undated row, a hiring row, a period unanswered and the SU verifier', () => {
    expect(slot({ period: null }).source).toBeNull();
    expect(slot({ phase: 'workplace' }).source).toBeNull();
    expect(slot({ role: 'verifier', period: 'before' }).source).toBeNull();
    expect(slot({ domain: 'su', role: 'verifier', period: 'from' }).source).toBeNull();
    expect(slot({ domain: 'su', phase: 'supplementary' })).toEqual({ ...pavel, source: 'answer' });
  });
});

describe('a value typed on a row', () => {
  const read = { trainerName: null, trainerJobTitle: 'Inspector SSM' };

  it('differs from the reading; a dialog’s save of the reading is none', () => {
    expect(typedOnRow(undefined, read, ['trainerName'])).toBe(false);
    expect(typedOnRow({ trainerName: null }, read, ['trainerName'])).toBe(false);
    expect(typedOnRow({ trainerJobTitle: ' Inspector SSM ' }, read, ['trainerJobTitle'])).toBe(
      false
    );
    expect(typedOnRow({ trainerName: 'Barbu' }, read, ['trainerName'])).toBe(true);
    expect(typedOnRow({ trainerJobTitle: '' }, read, ['trainerJobTitle'])).toBe(true);
  });

  it('is no empty save over a value an older proposal took from the themes', () => {
    expect(
      typedOnRow({ trainerJobTitle: null }, read, ['trainerJobTitle'], ['trainerJobTitle'])
    ).toBe(false);
  });
});

describe('an answer', () => {
  it('counts the roles the domain’s sheet asks', () => {
    expect(hasAnswer('ssm', { verifier: { before: pavel } })).toBe(true);
    expect(hasAnswer('su', { verifier: { before: pavel } })).toBe(false);
    expect(hasAnswer('su', { trainer: {} })).toBe(false);
    expect(hasAnswer('su', undefined)).toBe(false);
  });

  it('is stored with a person’s changes, and changes stored before it still read', () => {
    const stored = { people: { a: { state: 'checked' } } };
    expect(employeeImportChangesSchema.parse(stored).people.a).toEqual({ state: 'checked' });
    const answered = { people: { a: { whoTrained: { ssm: answer } } } };
    expect(employeeImportChangesSchema.parse(answered).people.a?.whoTrained?.ssm).toEqual(answer);
    expect(
      employeeImportChangesSchema.safeParse({
        people: { a: { whoTrained: { ssm: { trainer: { from: { name: '', jobTitle: null } } } } } },
      }).success
    ).toBe(false);
  });
});
