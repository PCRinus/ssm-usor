import { describe, expect, it } from 'vitest';

import { billingAlertMessage, describeFailure } from './operator-alerts';

describe('billingAlertMessage', () => {
  it("links to the live dashboard for a live account's invoice", () => {
    const message = billingAlertMessage(
      {
        kind: 'payment_failed',
        organizationId: 'org-1',
        invoice: { id: 'in_1Live', number: null, accountId: 'acct_1Live', livemode: true },
        due: { cents: 4719, currency: 'eur' },
        accessUntil: null,
      },
      'Prevenție Activă SRL'
    );

    expect(message.lines).toEqual([
      'Organizația: Prevenție Activă SRL · org-1',
      'Factura Stripe: fără număr · in_1Live',
      '<https://dashboard.stripe.com/acct_1Live/invoices/in_1Live>',
      'De plată: 47,19 EUR',
      'Stripe reîncearcă plata.',
      'Ce faci: nimic deocamdată; dacă plata nu trece, ia legătura cu clientul.',
    ]);
  });
});

describe('describeFailure', () => {
  it('keeps no email address and stays short', () => {
    expect(describeFailure(new Error('Refused for ana.pop@example.ro, retry'))).toBe(
      'Refused for [email], retry'
    );
    expect(describeFailure(new Error('x'.repeat(1_000)))).toHaveLength(300);
  });
});
