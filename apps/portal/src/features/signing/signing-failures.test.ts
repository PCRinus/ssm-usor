import type { MessageDescriptor } from '@lingui/core';
import { describe, expect, it } from 'vitest';

import type { SignSessionResponse } from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { i18n } from '@/app/i18n';

import { codeErrorOf, outcomesOf, sessionFailureOf } from './signing-failures';
import type { PortalSignatureRequest, SigningItem } from './signing-items';

const refusal = (reason: string, extra: Record<string, unknown> = {}) =>
  new ApiHttpError(409, { error: 'conflict', message: 'Refused.', reason, ...extra });

const status = (code: number) => new ApiHttpError(code, { error: 'refused', message: 'Refused.' });

const text = (message: MessageDescriptor | null) => (message ? i18n._(message) : null);

describe('sessionFailureOf', () => {
  it.each([
    ['signing_item_not_found', 'nu mai așteaptă semnătura ta'],
    ['signer_has_no_address', 'Nu avem o adresă de email sau un telefon'],
    ['signing_code_not_sent', 'Nu am putut trimite codul'],
    ['signing_unavailable', 'Semnarea nu este disponibilă acum'],
  ])('words %s', (reason, words) => {
    const failure = sessionFailureOf(refusal(reason));
    expect(text(failure.message)).toContain(words);
    expect(failure.retryAfterSeconds).toBe(0);
    expect(failure.sms).toBeUndefined();
  });

  it.each([
    [400, 'Cu un cod semnezi cel mult 30 de documente.'],
    [401, 'Sesiunea ta în portal a expirat. Ieși din cont și intră din nou.'],
    [403, 'Sesiunea ta în portal a expirat. Ieși din cont și intră din nou.'],
  ])('words a %i without a reason', (code, words) => {
    expect(text(sessionFailureOf(status(code)).message)).toContain(words);
  });

  it('waits the time the API names after a code asked for too soon, or a minute', () => {
    const named = sessionFailureOf(refusal('code_rate_limited', { retryAfterSeconds: 37 }));
    expect(text(named.message)).toBe('Ai cerut un cod acum mai puțin de un minut.');
    expect(named.retryAfterSeconds).toBe(37);
    expect(sessionFailureOf(refusal('code_rate_limited')).retryAfterSeconds).toBe(60);
  });

  it('carries an SMS refusal for its own notice', () => {
    const failure = sessionFailureOf(
      refusal('sms_allowance_reached', { resumesAt: '2026-11-13T23:00:00.000Z' })
    );
    expect(failure.sms).toEqual({
      reason: 'sms_allowance_reached',
      resumesAt: '2026-11-13T23:00:00.000Z',
    });
    expect(failure.retryAfterSeconds).toBe(0);
  });

  it('calls anything else unreachable', () => {
    expect(text(sessionFailureOf(new TypeError('Failed to fetch')).message)).toBe(
      text(sessionFailureOf(status(500)).message)
    );
    expect(sessionFailureOf(new TypeError('Failed to fetch')).retryAfterSeconds).toBe(0);
  });
});

describe('codeErrorOf', () => {
  it.each([
    ['code_expired', 'Codul a expirat'],
    ['code_already_used', 'Codul a fost deja folosit'],
    ['code_attempts_exceeded', 'Codul a fost greșit de trei ori'],
  ])('treats %s as a spent code', (reason, words) => {
    const error = codeErrorOf(refusal(reason));
    expect(error.kind).toBe('spent');
    expect(error.kind !== 'invalid' && text(error.message)).toContain(words);
  });

  it('counts the attempts left after a wrong code, and the last one as spent', () => {
    expect(codeErrorOf(refusal('code_invalid', { attemptsLeft: 2 }))).toEqual({
      kind: 'invalid',
      attemptsLeft: 2,
    });
    expect(codeErrorOf(refusal('code_invalid')).kind).toBe('invalid');
    expect(codeErrorOf(refusal('code_invalid', { attemptsLeft: 0 })).kind).toBe('spent');
  });

  it('words a closed service, an ended session and anything else', () => {
    const words = (cause: unknown) => {
      const error = codeErrorOf(cause);
      return error.kind === 'other' ? text(error.message) : null;
    };
    expect(words(refusal('signing_unavailable'))).toContain('Semnarea nu este disponibilă acum');
    expect(words(status(401))).toContain('Sesiunea ta în portal a expirat');
    expect(words(status(403))).toContain('Sesiunea ta în portal a expirat');
    expect(words(new TypeError('Failed to fetch'))).toBe(
      text(sessionFailureOf(new TypeError('Failed to fetch')).message)
    );
  });
});

describe('outcomesOf', () => {
  const request = (id: string): SigningItem => ({
    kind: 'request',
    key: `request:${id}`,
    request: { id } as PortalSignatureRequest,
  });
  const agreement: SigningItem = {
    kind: 'agreement',
    key: 'agreement:e1',
    employeeId: 'e1',
    party: 'employee',
  };

  it('pairs every item with whether it was signed and why not', () => {
    const result = {
      signed: [{ requestId: 'r1', agreementState: null }],
      failed: [{ requestId: 'r2', reason: 'sheet_busy' }],
      agreements: [{ employeeId: 'e1', signed: false, reason: 'agreement_changed' }],
    } as unknown as SignSessionResponse;

    const outcomes = outcomesOf([agreement, request('r1'), request('r2'), request('r3')], result);

    expect(outcomes.map(({ item, signed, reason }) => [item.key, signed, text(reason)])).toEqual([
      [
        'agreement:e1',
        false,
        'Actul adițional s-a schimbat de când ai cerut codul. Cere un cod nou și semnează din nou.',
      ],
      ['request:r1', true, null],
      [
        'request:r2',
        false,
        'Fișa era folosită chiar atunci de altă semnătură. Încearcă din nou peste un minut.',
      ],
      ['request:r3', false, null],
    ]);
  });

  it('counts an agreement the answer does not mention as not signed', () => {
    const result = { signed: [], failed: [], agreements: [] } as unknown as SignSessionResponse;
    expect(outcomesOf([agreement], result)).toEqual([
      { item: agreement, signed: false, reason: null },
    ]);
  });
});
