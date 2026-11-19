import { describe, expect, it } from 'vitest';

import {
  employeeImportValueAllowed,
  heldTrainingKey,
  hiringTestRowIds,
  personIncludedByDefault,
  resolveEmployeeImportField,
  reviewedRowValue,
  rowExaminer,
} from './employee-import-rules';

const field = (app?: string | null) => ({
  options: [
    { value: 'Popescu', pageIds: ['p1'] },
    { value: 'Popesku', pageIds: ['p2'] },
  ],
  ...(app === undefined ? {} : { app }),
});

describe("a person's field as confirming takes it", () => {
  it("takes the one value the person's pages give", () => {
    const resolved = resolveEmployeeImportField('lastName', field(), undefined, new Set(['p1']));
    expect(resolved).toMatchObject({ value: 'Popescu', choice: false, edited: false });
    expect(resolved.own.map((option) => option.index)).toEqual([0]);
  });

  it('asks for a choice between the pages unless the app has a value to keep', () => {
    const pages = new Set(['p1', 'p2']);
    expect(resolveEmployeeImportField('lastName', field(), undefined, pages)).toMatchObject({
      value: null,
      choice: true,
    });
    expect(resolveEmployeeImportField('lastName', field('Pop'), undefined, pages)).toMatchObject({
      value: 'Pop',
      choice: false,
    });
  });

  it("keeps the app's value unless the member replaces it with a different one", () => {
    const pages = new Set(['p1']);
    expect(resolveEmployeeImportField('lastName', field('Pop'), undefined, pages)).toMatchObject({
      value: 'Pop',
      replace: false,
    });
    expect(
      resolveEmployeeImportField('lastName', field('Pop'), { replace: true }, pages)
    ).toMatchObject({ value: 'Popescu', replace: true });
    expect(
      resolveEmployeeImportField('lastName', field('POPESCU'), { replace: true }, pages)
    ).toMatchObject({ value: 'POPESCU', replace: false });
  });

  it('takes what the member wrote, and says when a chosen option is gone', () => {
    const pages = new Set(['p1']);
    expect(
      resolveEmployeeImportField('lastName', field('Pop'), { value: 'Popa' }, pages)
    ).toMatchObject({ value: 'Popa', edited: true, replace: true });
    expect(resolveEmployeeImportField('lastName', field(), { value: 'Popa' }, pages)).toMatchObject(
      { value: 'Popa', replace: false }
    );
    expect(resolveEmployeeImportField('lastName', field(), { option: 5 }, pages)).toMatchObject({
      value: null,
      missingOption: true,
      edited: true,
    });
  });
});

describe('a value confirming takes', () => {
  it("holds to the employee form's limits", () => {
    expect(employeeImportValueAllowed('jobTitle', 'A')).toBe(false);
    expect(employeeImportValueAllowed('jobTitle', 'Ajutor')).toBe(true);
    expect(employeeImportValueAllowed('commuteMinutes', 601)).toBe(false);
    expect(employeeImportValueAllowed('hiredAt', '12.03.2024')).toBe(false);
    expect(employeeImportValueAllowed('bloodGroup', 'A(II)')).toBe(true);
    expect(employeeImportValueAllowed('cnp', '1234567890123')).toBe(false);
  });
});

describe('who is written unless the member decides otherwise', () => {
  it('leaves out someone new with a leave date, and completes an existing one', () => {
    expect(personIncludedByDefault(null, false)).toBe(true);
    expect(personIncludedByDefault('2024-01-31', false)).toBe(false);
    expect(personIncludedByDefault('2024-01-31', true)).toBe(true);
  });
});

describe('the hiring test confirming writes', () => {
  const hiring = { test: 'hiring' };
  const row = (id: string, values: Partial<Parameters<typeof hiringTestRowIds>[0][number]>) => ({
    id,
    domain: 'ssm' as const,
    phase: 'introductory_general' as const,
    heldOn: '2024-01-10',
    testOnly: false,
    test: hiring,
    ...values,
  });

  it('is the newest row of the phase the test closes', () => {
    expect(hiringTestRowIds([row('older', { heldOn: '2023-01-10' }), row('newer', {})])).toEqual(
      new Set(['newer'])
    );
    expect(
      hiringTestRowIds([
        row('a', { domain: 'su' }),
        row('b', { domain: 'su', phase: 'workplace', heldOn: '2020-01-01' }),
        row('c', { domain: 'su', phase: 'workplace', heldOn: null }),
      ])
    ).toEqual(new Set(['b']));
  });
});

describe('a row value an older reading took from the themes', () => {
  it('counts as empty unless the member typed another', () => {
    expect(reviewedRowValue(undefined, 'material', 'Tematica', true)).toBeNull();
    expect(reviewedRowValue({ material: 'Tematica ' }, 'material', 'Tematica', true)).toBeNull();
    expect(reviewedRowValue({ material: 'Riscuri' }, 'material', 'Tematica', true)).toBe('Riscuri');
    expect(reviewedRowValue(undefined, 'material', 'Tematica', false)).toBe('Tematica');
  });

  it("leaves the test's examiner empty when it is the themed trainer", () => {
    const themed = {
      signatures: { verifier: 'no_box' },
      verifierName: null,
      fromThemes: ['trainerName', 'trainerJobTitle'],
      test: { examinerName: 'Barbu Ionuț', examinerJobTitle: 'inspector SSM' },
    };
    expect(rowExaminer(themed, undefined)).toEqual({ examinerName: null, examinerJobTitle: null });
    expect(
      rowExaminer(themed, { examinerName: 'Pavel Dan', examinerJobTitle: 'inspector SSM' })
    ).toEqual({
      examinerName: 'Pavel Dan',
      examinerJobTitle: 'inspector SSM',
    });
  });
});

describe('one training held by several people', () => {
  const held = {
    domain: 'ssm',
    phase: 'periodic',
    heldOn: '2025-03-04',
    durationMinutes: 60,
    trainerName: 'Barbu Ionuț',
    trainerJobTitle: 'Inspector SSM',
    verifierName: null,
    verifierJobTitle: null,
    material: 'Tematica',
    supplementaryReason: null,
  };

  it('names the trainer however the sheets title them', () => {
    for (const trainerName of ['dl. Barbu Ionuț', 'Barbu Ionut PFA', ' barbu ionuț ']) {
      expect(heldTrainingKey({ ...held, trainerName })).toBe(heldTrainingKey(held));
    }
  });

  it('keeps a verifier only with both halves written, and an empty value as none', () => {
    expect(heldTrainingKey({ ...held, verifierName: 'Dan Marin' })).toBe(heldTrainingKey(held));
    expect(heldTrainingKey({ ...held, material: ' ' })).toBe(
      heldTrainingKey({ ...held, material: null })
    );
    expect(
      heldTrainingKey({ ...held, verifierName: 'Dan Marin', verifierJobTitle: 'Inspector' })
    ).not.toBe(heldTrainingKey(held));
  });

  it('keeps the reason only on a supplementary training', () => {
    expect(heldTrainingKey({ ...held, supplementaryReason: 'accident' })).toBe(
      heldTrainingKey(held)
    );
  });
});
