import { describe, expect, it } from 'vitest';

import { employeeImportChangesSchema } from './imports';
import {
  answerPeriod,
  handoverPrecedes,
  handoverWindow,
  hasAnswer,
  liveAnswer,
  monthOnlyRow,
  noHandover,
  rowSigner,
  staleRoles,
  typedOnRow,
  type WhoTrainedAnswer,
} from './who-trained';

const vasile = { name: 'Iordache Vasile', jobTitle: 'Șef de șantier' };
const pavel = { name: 'Pavel Mihai', jobTitle: 'Specialist SSM' };
const october = { splitOn: '2022-10-03', previousOn: null };
const answer: WhoTrainedAnswer = {
  trainer: { before: pavel, from: vasile, ...october },
  verifier: { from: pavel, ...october },
};

describe('the period of a row', () => {
  it('is before the handover, from it on, or none for an undated row', () => {
    expect(answerPeriod('2022-10-02', october)).toBe('before');
    expect(answerPeriod('2022-10-03', october)).toBe('from');
    expect(answerPeriod('2023-01-01', october)).toBe('from');
    expect(answerPeriod(null, october)).toBeNull();
  });

  it('is the one answer for every dated row without a handover', () => {
    expect(answerPeriod('2010-01-01', noHandover)).toBe('from');
  });

  it('is none for a month-only row of the handover’s month, unless the handover is the 1st', () => {
    expect(answerPeriod('2022-10-01', october, true)).toBeNull();
    expect(answerPeriod('2022-09-01', october, true)).toBe('before');
    expect(answerPeriod('2022-10-01', { splitOn: '2022-10-01', previousOn: null }, true)).toBe(
      'from'
    );
    expect(handoverPrecedes('2022-10-03', '2022-10-01', true)).toBe(true);
    expect(handoverPrecedes('2022-10-03', '2022-10-01', false)).toBe(false);
  });

  it('is none before the previous handover, and before only from it on', () => {
    const two = { splitOn: '2022-10-03', previousOn: '2020-02-03' };
    expect(answerPeriod('2020-01-31', two)).toBeNull();
    expect(answerPeriod('2020-02-03', two)).toBe('before');
    expect(answerPeriod('2020-02-01', two, true)).toBeNull();
  });

  it('splits at a person’s latest handover and bounds it by the one before, across pages', () => {
    expect(
      handoverWindow([
        { handovers: [{ date: '2022-10-03' }] },
        { handovers: [{ date: '2022-10-03' }, { date: null }] },
        { handovers: [{ date: '2019-02-01' }] },
        {},
      ])
    ).toEqual({ splitOn: '2022-10-03', previousOn: '2019-02-01' });
    expect(handoverWindow([{ handovers: [{ date: null }] }])).toEqual(noHandover);
  });

  it('reads only to the month unless the member wrote another day', () => {
    const row = { heldOn: '2022-10-01', flags: ['month_only'] };
    expect(monthOnlyRow(row, undefined)).toBe(true);
    expect(monthOnlyRow(row, { heldOn: '2022-10-01', durationMinutes: 90 })).toBe(true);
    expect(monthOnlyRow(row, { heldOn: '2022-10-20' })).toBe(false);
  });
});

describe('an answer under the sheets’ handovers', () => {
  it('names nothing in a role given under handovers the sheets no longer record', () => {
    expect(liveAnswer(october, answer)).toEqual(answer);
    expect(liveAnswer({ splitOn: '2023-01-09', previousOn: null }, answer)).toEqual({});
    expect(liveAnswer(noHandover, answer)).toEqual({});
    expect(staleRoles('ssm', noHandover, answer)).toEqual(['trainer', 'verifier']);
    expect(staleRoles('su', october, answer)).toEqual([]);
    expect(liveAnswer(october, { trainer: { from: vasile } })).toEqual({});
  });

  it('takes the handovers copied with it while the person’s sheets record none', () => {
    const copied = { ...answer, splitCopied: true as const };
    expect(liveAnswer(noHandover, copied)).toEqual(copied);
    expect(
      liveAnswer({ splitOn: '2021-01-04', previousOn: null }, copied)?.trainer
    ).toBeUndefined();
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
      heldOn: '2022-05-16',
      monthOnly: false,
      handovers: october,
      answer,
      ...overrides,
    });

  it('is the answer for the row’s period where the sheet names nobody', () => {
    expect(slot({})).toEqual({ ...pavel, source: 'answer' });
    expect(slot({ heldOn: '2023-05-15' })).toEqual({ ...vasile, source: 'answer' });
    expect(slot({ role: 'verifier', heldOn: '2023-05-15' })).toEqual({
      ...pavel,
      source: 'answer',
    });
  });

  it('never replaces a name the sheet writes, one typed on the row, or a function on the sheet', () => {
    expect(slot({ name: 'Barbu Ionuț', jobTitle: null })).toEqual({
      name: 'Barbu Ionuț',
      jobTitle: null,
      source: 'sheet',
    });
    expect(slot({ typed: true })).toEqual({ name: null, jobTitle: null, source: 'row' });
    expect(slot({ jobTitle: 'Maistru' })).toEqual({
      name: 'Pavel Mihai',
      jobTitle: 'Maistru',
      source: 'answer',
    });
  });

  it('stays empty for an undated row, a hiring row, a period unanswered, the SU verifier and a stale answer', () => {
    expect(slot({ heldOn: null }).source).toBeNull();
    expect(slot({ phase: 'workplace' }).source).toBeNull();
    expect(slot({ role: 'verifier' }).source).toBeNull();
    expect(slot({ domain: 'su', role: 'verifier', heldOn: '2023-05-15' }).source).toBeNull();
    expect(slot({ handovers: noHandover }).source).toBeNull();
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
    const refused = (ssm: unknown) =>
      employeeImportChangesSchema.safeParse({ people: { a: { whoTrained: { ssm } } } }).success;
    expect(refused({ trainer: { from: { name: '', jobTitle: null } } })).toBe(false);
    expect(refused({ verifier: { from: { name: 'Pavel Mihai', jobTitle: null } } })).toBe(false);
    expect(refused({ trainer: { from: { name: 'Pavel Mihai', jobTitle: null } } })).toBe(true);
  });
});
