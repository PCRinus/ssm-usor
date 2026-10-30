import { describe, expect, it } from 'vitest';

import { checkCnp, parseBloodType, rowFlags } from './employee-checks';
import { cnps, today } from './test/sheets';

describe('parseBloodType', () => {
  it.each([
    [['A II Rh+', null], { group: 'A(II)', rh: '+' }],
    [['0 I, Rh +', null], { group: '0(I)', rh: '+' }],
    [['O(I)', 'negativ'], { group: '0(I)', rh: '-' }],
    [['AB IV -', null], { group: 'AB(IV)', rh: '-' }],
    [['Grupa B III', 'Rh pozitiv'], { group: 'B(III)', rh: '+' }],
    [['III', null], { group: 'B(III)', rh: null }],
    [[null, 'Rh -'], { group: null, rh: '-' }],
  ] as const)('reads %j', (written, expected) => {
    expect(parseBloodType(...written)).toEqual(expected);
  });

  it('reads no group where the letter and the numeral disagree', () => {
    expect(parseBloodType('A IV')).toEqual({ group: null, rh: null });
  });
});

describe('checkCnp', () => {
  it('passes a valid CNP that agrees with the birth date, or with none', () => {
    expect(checkCnp(cnps.coman, '1985-06-15')).toEqual({ status: 'valid' });
    expect(checkCnp('285 0615 320013', null)).toEqual({ status: 'valid' });
  });

  it('offers the code an unreadable digit has when the birth date fixes it', () => {
    const written = `${cnps.rusu.slice(0, 9)}?${cnps.rusu.slice(10)}`;

    expect(checkCnp(written, '1975-12-01')).toEqual({ status: 'invalid', correction: cnps.rusu });
    expect(checkCnp(written, null)).toEqual({ status: 'invalid', correction: null });
  });

  it('offers the code a misread digit of the date had, by the birth date', () => {
    const misread = `${cnps.coman.slice(0, 5)}8${cnps.coman.slice(6)}`;

    expect(checkCnp(misread, '1985-06-15')).toEqual({ status: 'invalid', correction: cnps.coman });
  });

  it('flags a valid CNP of another birth date, with nothing to offer', () => {
    expect(checkCnp(cnps.coman, '1985-06-16')).toEqual({
      status: 'birth_date_mismatch',
      correction: null,
    });
  });

  it('offers nothing for two unreadable digits', () => {
    expect(checkCnp(`${cnps.rusu.slice(0, 9)}??${cnps.rusu.slice(11)}`, '1975-12-01')).toEqual({
      status: 'invalid',
      correction: null,
    });
  });
});

describe('rowFlags', () => {
  const signed = { trainee: 'present', trainer: 'present', verifier: 'absent' } as const;
  const base = {
    phase: 'periodic' as const,
    heldOn: '2025-07-14',
    durationMinutes: 120,
    testOnly: false,
    signatures: signed,
  };
  const context = { hiredAt: '2021-01-18', today };

  it('flags nothing on a plain periodic row', () => {
    expect(rowFlags(base, context)).toEqual([]);
  });

  it('flags a periodic duration other than 60, 90 or 120 minutes', () => {
    expect(rowFlags({ ...base, durationMinutes: 1440 }, context)).toEqual(['unusual_duration']);
    expect(rowFlags({ ...base, phase: 'workplace', durationMinutes: 480 }, context)).toEqual([]);
  });

  it('flags a date before the hire date or after today, but not a hiring training', () => {
    expect(rowFlags({ ...base, heldOn: '2020-12-01' }, context)).toEqual(['before_hire']);
    expect(
      rowFlags(
        { ...base, phase: 'introductory_general', heldOn: '2021-01-17', durationMinutes: 480 },
        context
      )
    ).toEqual([]);
    expect(rowFlags({ ...base, heldOn: '2026-11-02' }, context)).toEqual(['after_today']);
  });

  it('flags an empty or unclear trainee box', () => {
    expect(rowFlags({ ...base, signatures: { ...signed, trainee: 'absent' } }, context)).toEqual([
      'unsigned',
    ]);
    expect(rowFlags({ ...base, signatures: { ...signed, trainee: 'unclear' } }, context)).toEqual([
      'signature_unclear',
    ]);
  });
});
