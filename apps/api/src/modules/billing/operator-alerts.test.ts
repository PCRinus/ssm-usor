import { describe, expect, it } from 'vitest';

import { ApiError } from '../../lib/errors';
import { failsUntilFixed, failureCause, MissingCompanyDetails } from './invoices';
import { OblioRefused } from './oblio';
import { billingAlertMessage, ownCode } from './operator-alerts';

describe('billingAlertMessage', () => {
  it("links to the live dashboard for a live account's invoice", () => {
    const message = billingAlertMessage({
      kind: 'payment_failed',
      organizationId: 'org-1',
      invoice: { id: 'in_1Live', number: null, accountId: 'acct_1Live', livemode: true },
      due: { cents: 4719, currency: 'eur' },
      accessUntil: null,
    });

    expect(message.lines).toEqual([
      'Organizația: org-1',
      'Factura Stripe: fără număr · in_1Live',
      '<https://dashboard.stripe.com/acct_1Live/invoices/in_1Live>',
      'De plată: 47,19 EUR',
      'Stripe reîncearcă plata.',
      'Ce faci: nimic deocamdată; dacă plata nu trece, ia legătura cu clientul.',
    ]);
  });
});

describe('failureCause', () => {
  const quoting = 'Popescu Ion PFA, CUI 1234567, ion@example.ro';

  it('names a failure by its kind and our own code, never by its text', () => {
    expect(failureCause(new MissingCompanyDetails('org-1'))).toEqual({ kind: 'company_details' });
    expect(failureCause(new OblioRefused(400, quoting))).toEqual({
      kind: 'oblio_refused',
      status: 400,
    });
    expect(failureCause(new OblioRefused(503, quoting))).toEqual({ kind: 'oblio_unavailable' });
    expect(
      failureCause(new ApiError('service_unavailable', quoting, undefined, 'oblio_unavailable'))
    ).toEqual({ kind: 'oblio_unavailable' });
    expect(
      failureCause(new ApiError('service_unavailable', quoting, undefined, 'oblio_login_refused'))
    ).toEqual({ kind: 'other', code: 'ApiError/oblio_login_refused' });
    expect(failureCause(new TypeError(quoting))).toEqual({ kind: 'other', code: 'TypeError' });
  });

  it('tells a failure that waits for a person from one a retry may clear', () => {
    expect(failsUntilFixed(failureCause(new OblioRefused(400, quoting)))).toBe(true);
    expect(failsUntilFixed(failureCause(new MissingCompanyDetails('org-1')))).toBe(true);
    expect(failsUntilFixed({ kind: 'other', code: 'ApiError/oblio_login_refused' })).toBe(true);
    expect(failsUntilFixed(failureCause(new OblioRefused(503, quoting)))).toBe(false);
    expect(failsUntilFixed(failureCause(new Error(quoting)))).toBe(false);
  });

  it('keeps a code that is not ours out of the message', () => {
    expect(ownCode('StripeRateLimitError')).toBe('StripeRateLimitError');
    expect(ownCode('see https://x.example\n**bold**')).toBe('Error');
  });
});
