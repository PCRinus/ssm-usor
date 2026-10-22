import { describe, expect, it } from 'vitest';

import {
  isSheetRowKey,
  lockFieldsOf,
  rowCapacity,
  sheetFieldNames,
  sheetRowKeys,
  signatureFieldOf,
  tableRowOf,
  testRowCapacity,
} from './signed-sheet';

describe('sheetFieldNames', () => {
  it('names a periodic row of the occupational safety sheet by its key and column', () => {
    expect(sheetFieldNames('ssm', 'p3')).toEqual({
      text: ['p3_date', 'p3_duration', 'p3_occupation', 'p3_material'],
      note: 'p3_note',
      signatures: {
        trainee: 'p3_sig_trainee',
        trainer: 'p3_sig_trainer',
        verifier: 'p3_sig_verifier',
      },
    });
    expect(sheetFieldNames('ssm', 's1').signatures).toHaveProperty('verifier', 's1_sig_verifier');
  });

  it('gives a fire-safety row the trainee and the trainer only, and no supplementary table', () => {
    expect(sheetFieldNames('psi', 'p17').signatures).toEqual({
      trainee: 'p17_sig_trainee',
      trainer: 'p17_sig_trainer',
    });
    expect(() => sheetFieldNames('psi', 's1')).toThrow();
  });

  it('refuses a row past the page', () => {
    expect(() => sheetFieldNames('ssm', `p${rowCapacity('ssm') + 1}`)).toThrow();
    expect(() => sheetFieldNames('ssm', `t${testRowCapacity + 1}`)).toThrow();
  });

  it("names a test result's row after annex 11's four columns, with no signature", () => {
    expect(sheetFieldNames('ssm', 't2')).toEqual({
      text: ['t2_date', 't2_material', 't2_grade', 't2_examiner'],
      note: 't2_note',
      signatures: {},
    });
    expect(() => sheetFieldNames('psi', 't1')).toThrow();
  });

  it('names the hiring rows after their form, the workplace one with its place', () => {
    expect(sheetFieldNames('ssm', 'h1').text).toEqual([
      'h1_date',
      'h1_duration',
      'h1_trainer',
      'h1_trainer_job_title',
      'h1_material',
    ]);
    expect(sheetFieldNames('psi', 'h2').text).toEqual([
      'h2_date',
      'h2_place',
      'h2_occupation',
      'h2_duration',
      'h2_trainer',
      'h2_trainer_job_title',
      'h2_material',
    ]);
  });

  it('signs the admission on the occupational safety sheet only', () => {
    expect(sheetFieldNames('ssm', 'adm')).toEqual({
      text: ['adm_name', 'adm_job_title', 'adm_date'],
      note: null,
      signatures: { admitter: 'adm_sig' },
    });
    expect(sheetFieldNames('psi', 'adm').signatures).toEqual({});
  });
});

describe('signatureFieldOf', () => {
  it("puts the workplace record's admitter on the admission block", () => {
    expect(signatureFieldOf('ssm', 'h2', 'admitter')).toBe('adm_sig');
    expect(signatureFieldOf('psi', 'h2', 'admitter')).toBeNull();
  });

  it('has no field for a slot the form does not print', () => {
    expect(signatureFieldOf('psi', 'p1', 'verifier')).toBeNull();
    expect(signatureFieldOf('ssm', 'p1', 'admitter')).toBeNull();
    expect(signatureFieldOf('ssm', 'h1', 'verifier')).toBe('h1_sig_verifier');
  });
});

describe('lockFieldsOf', () => {
  it('locks the text of the row, never its note or a signature field', () => {
    expect(lockFieldsOf('ssm', 'p2')).toEqual([
      'p2_date',
      'p2_duration',
      'p2_occupation',
      'p2_material',
    ]);
  });

  it("locks the admission with the workplace training's row", () => {
    expect(lockFieldsOf('psi', 'h2')).toEqual([
      ...sheetFieldNames('psi', 'h2').text,
      'adm_name',
      'adm_job_title',
      'adm_date',
    ]);
  });
});

describe('row keys', () => {
  it('lists the rows of a sheet, the occupational safety one with both tables and the test block', () => {
    expect(sheetRowKeys('ssm')).toHaveLength(3 + 2 * rowCapacity('ssm') + testRowCapacity);
    expect(sheetRowKeys('psi')).toHaveLength(3 + rowCapacity('psi'));
    expect(sheetRowKeys('ssm').every(isSheetRowKey)).toBe(true);
  });

  it('reads the table and index of a periodic row', () => {
    expect(tableRowOf('s12')).toEqual({ table: 's', index: 12 });
    expect(tableRowOf('t3')).toEqual({ table: 't', index: 3 });
    expect(tableRowOf('adm')).toBeNull();
    expect(isSheetRowKey('p0')).toBe(false);
    expect(isSheetRowKey('x1')).toBe(false);
  });
});
