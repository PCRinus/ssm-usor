import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { type Invoice, invoiceListSearch, sortInvoices } from './invoice-list';

const invoice = (id: string, issuedAt: string | null, amountCents: number): Invoice => ({
  stripeInvoiceId: id,
  kind: 'invoice',
  number: issuedAt ? `SSMUSOR-${id}` : null,
  issuedAt,
  amountCents,
  subtotalCents: null,
  currency: 'eur',
  stornoOf: null,
  hasPdf: true,
});

// As the API lists them: the newest recorded first.
const listed = [
  invoice('issuing', null, 14399),
  invoice('b', '2026-10-16T09:00:00.000Z', 14399),
  invoice('a', '2026-10-16T09:00:00.000Z', 15609),
  invoice('old', '2026-09-16T09:00:00.000Z', 14399),
];

const ids = (invoices: Invoice[]) => invoices.map((item) => item.stripeInvoiceId);

describe('the order of the invoices', () => {
  it('keeps the newest recorded first between invoices of the same date, both ways', () => {
    expect(ids(sortInvoices(listed, { sort: 'issuedAt', order: 'desc' }))).toEqual([
      'issuing',
      'b',
      'a',
      'old',
    ]);
    expect(ids(sortInvoices(listed, { sort: 'issuedAt', order: 'asc' }))).toEqual([
      'old',
      'a',
      'b',
      'issuing',
    ]);
  });

  it('puts the newest recorded first between invoices of the same amount, both ways', () => {
    expect(ids(sortInvoices(listed, { sort: 'amount', order: 'asc' }))).toEqual([
      'issuing',
      'b',
      'old',
      'a',
    ]);
    expect(ids(sortInvoices(listed, { sort: 'amount', order: 'desc' }))).toEqual([
      'a',
      'issuing',
      'b',
      'old',
    ]);
  });

  it('drops a sort or an order the address cannot hold', () => {
    expect(z.object(invoiceListSearch).parse({ sort: 'number', order: 'sideways' })).toEqual({
      sort: undefined,
      order: undefined,
    });
  });
});
