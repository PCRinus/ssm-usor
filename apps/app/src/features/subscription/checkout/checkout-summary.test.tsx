import type { BillingChoice } from '@ssm-usor/contracts';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { previewFor } from '@/test/billing-fixture';

import { CheckoutSummary } from './checkout-summary';

const monthly: BillingChoice = { plan: 'start', step: 250, interval: 'month' };

function renderPurchase(purchasedAt: Date, firstRenewal: Date) {
  const preview = previewFor(monthly, {
    dueToday: 3900,
    appliesAt: purchasedAt.toISOString(),
    firstChargeAt: firstRenewal.toISOString(),
  });
  render(
    <CheckoutSummary
      mode="new"
      choice={monthly}
      preview={preview}
      settling={false}
      inTrial={false}
      readOnly={false}
    >
      {null}
    </CheckoutSummary>
  );
  return screen.getByTestId('checkout-when').textContent;
}

afterEach(cleanup);

describe('the monthly renewal day before a purchase', () => {
  it('is the purchase day', () => {
    expect(renderPurchase(new Date(2027, 0, 15, 12), new Date(2027, 1, 15, 12))).toContain(
      'Abonamentul se reînnoiește în fiecare lună, pe 15.'
    );
  });

  it('stays the 31st when the first renewal falls on 28 February, with the last day of shorter months', () => {
    expect(renderPurchase(new Date(2027, 0, 31, 12), new Date(2027, 1, 28, 12))).toContain(
      'Abonamentul se reînnoiește în fiecare lună, pe 31, iar în lunile fără această zi, în ultima zi a lunii.'
    );
  });
});
