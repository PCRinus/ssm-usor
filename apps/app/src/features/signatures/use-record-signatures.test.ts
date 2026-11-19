import { describe, expect, it } from 'vitest';

import type { RecordSignaturesResponse } from '@/api/generated/api';

import { trainingLocks } from './use-record-signatures';

const frozen =
  'Instruirea este semnată electronic. Anulează semnăturile ca să o poți modifica sau șterge.';
const kept =
  'Instruirea are semnături, chiar anulate sau pe hârtie, care rămân în evidență, așa că nu se mai poate șterge.';
const printed =
  'Instruirea este trecută pe o fișă individuală semnată electronic, care nu se mai schimbă, așa că nu se mai poate modifica sau șterge.';

const none = { signed: false, hasSignatures: false, printed: false };
const signaturesWith = (
  states: RecordSignaturesResponse['slots'][number]['state'][],
  hasSignatures = false
) =>
  ({
    recordId: 'record',
    hasSignatures,
    slots: states.map((state) => ({ state })),
  }) as unknown as RecordSignaturesResponse;

describe('trainingLocks', () => {
  it.each([
    ['nothing signed', none, undefined, { edit: null, delete: null }],
    [
      'printed on a signed sheet',
      { ...none, hasSignatures: true, printed: true },
      undefined,
      { edit: printed, delete: printed },
    ],
    [
      'signed electronically',
      { ...none, signed: true, hasSignatures: true },
      undefined,
      { edit: frozen, delete: frozen },
    ],
    [
      'kept signatures only',
      { ...none, hasSignatures: true },
      undefined,
      { edit: null, delete: kept },
    ],
    [
      "a signed slot on this record's signatures",
      none,
      signaturesWith(['pending', 'signed']),
      { edit: frozen, delete: frozen },
    ],
    [
      'voided slots on a record that keeps its signatures',
      none,
      signaturesWith(['void', 'void'], true),
      { edit: null, delete: kept },
    ],
  ])('locks a training with %s', (_, training, signatures, locks) => {
    expect(trainingLocks(training, signatures)).toEqual(locks);
  });
});
