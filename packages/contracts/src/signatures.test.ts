import { describe, expect, it } from 'vitest';

import { paperSignatureRequestSchema, signatureRequestLabel } from './signatures';

describe('signatureRequestLabel', () => {
  it('names a training record by its phase, domain and day', () => {
    expect(
      signatureRequestLabel({
        kind: 'training_record',
        domain: 'ssm',
        phase: 'introductory_general',
        heldOn: '2026-01-05',
      })
    ).toBe('Instruire introductiv-generală SSM · 05.01.2026');
  });

  it('names a test sheet by its test, domain and day', () => {
    expect(
      signatureRequestLabel({
        kind: 'test_sheet',
        domain: 'ssm',
        test: 'hiring',
        takenOn: '2026-10-21',
      })
    ).toBe('Fișa de test · Test la angajare SSM · 21.10.2026');
    expect(
      signatureRequestLabel({
        kind: 'test_sheet',
        domain: 'psi',
        test: 'annual',
        takenOn: '2027-10-01',
      })
    ).toBe('Fișa de test · Test anual PSI · 01.10.2027');
  });
});

describe('paperSignatureRequestSchema', () => {
  it("takes a record's slots only: the examiner is a test sheet's", () => {
    expect(
      paperSignatureRequestSchema.safeParse({ slot: 'trainer', signerName: 'Dan' }).success
    ).toBe(true);
    expect(
      paperSignatureRequestSchema.safeParse({ slot: 'examiner', signerName: 'Dan' }).success
    ).toBe(false);
  });
});
