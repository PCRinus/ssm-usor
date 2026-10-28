import { describe, expect, it } from 'vitest';

import {
  type BillingOrganization,
  type PaidStripeInvoice,
  shouldIssue,
  testClient,
  toOblioDocument,
  toStorno,
} from './oblio-documents';

const organization: BillingOrganization = {
  name: 'Protecția Muncii Expert SRL',
  cui: 'RO40123456',
  registryNumber: 'J40/1234/2019',
  countyCode: 'CJ',
  locality: 'Cluj-Napoca',
  addressLine: 'Str. Memorandumului nr. 28',
  vatPayer: true,
  recipientEmail: 'facturi@pmexpert.ro',
};

const invoice: PaidStripeInvoice = {
  id: 'in_1QxYz',
  lines: [
    {
      description: 'SSM Ușor Start, abonament lunar',
      unitAmount: 3900,
      quantity: 1,
      period: {
        start: new Date('2026-11-01T00:00:00+02:00'),
        end: new Date('2026-11-30T23:59:59+02:00'),
      },
    },
    { description: 'Pachet 50 de angajați', unitAmount: 1500, quantity: 2, period: null },
  ],
  total: 8349,
  paymentReference: 'pi_3QxYzAbC',
  paidAt: new Date('2026-11-01T08:15:00+02:00'),
};

const expectedProducts = [
  {
    name: 'SSM Ușor Start, abonament lunar',
    description: 'Perioada 01.11.2026 – 30.11.2026',
    price: 39,
    measuringUnit: 'buc',
    currency: 'EUR',
    vatName: 'Normala',
    vatPercentage: 21,
    vatIncluded: 0,
    quantity: 1,
    productType: 'Serviciu',
  },
  {
    name: 'Pachet 50 de angajați',
    price: 15,
    measuringUnit: 'buc',
    currency: 'EUR',
    vatName: 'Normala',
    vatPercentage: 21,
    vatIncluded: 0,
    quantity: 2,
    productType: 'Serviciu',
  },
];

describe('Oblio documents', () => {
  it('makes a production invoice out to the organization, emailed, sent to SPV and collected', () => {
    expect(toOblioDocument('invoice', organization, invoice)).toEqual({
      kind: 'invoice',
      payload: {
        client: {
          name: 'Protecția Muncii Expert SRL',
          cif: 'RO40123456',
          rc: 'J40/1234/2019',
          address: 'Str. Memorandumului nr. 28',
          state: 'Cluj',
          city: 'Cluj-Napoca',
          country: 'Romania',
          email: 'facturi@pmexpert.ro',
          vatPayer: 1,
          save: 1,
          autocomplete: 0,
        },
        seriesName: 'SSMUSOR',
        language: 'RO',
        currency: 'EUR',
        products: expectedProducts,
        internalNote: 'Stripe in_1QxYz',
        sendEmail: 1,
        spvExtern: 1,
        collect: { type: 'Card', documentNumber: 'pi_3QxYzAbC', value: 83.49 },
        idempotencyKey: 'in_1QxYz',
      },
    });
  });

  it('makes a non-prod proforma out to the test client, never emailed or sent to SPV', () => {
    const { kind, payload } = toOblioDocument('proforma', organization, invoice);

    expect(kind).toBe('proforma');
    expect(payload).toEqual({
      client: testClient,
      seriesName: 'TEST',
      language: 'RO',
      currency: 'EUR',
      products: expectedProducts,
      mentions: 'Proformă de test, fără valoare fiscală, pentru Protecția Muncii Expert SRL.',
      internalNote: 'Stripe in_1QxYz',
      sendEmail: 0,
      idempotencyKey: 'in_1QxYz',
    });
    expect(payload).not.toHaveProperty('spvExtern');
    expect(payload).not.toHaveProperty('collect');
    expect(testClient).not.toHaveProperty('cif');
    expect(testClient.save).toBe(0);
  });

  it('leaves out the client fields the organization has not filled in', () => {
    const { payload } = toOblioDocument(
      'invoice',
      {
        ...organization,
        registryNumber: null,
        countyCode: null,
        locality: null,
        addressLine: null,
      },
      invoice
    );

    for (const field of ['rc', 'state', 'city', 'address']) {
      expect(payload.client).not.toHaveProperty(field);
    }
  });

  it('issues nothing for an invoice of zero', () => {
    const free = { ...invoice, total: 0 };

    expect(shouldIssue(free)).toBe(false);
    expect(shouldIssue(invoice)).toBe(true);
    expect(() => toOblioDocument('invoice', organization, free)).toThrow(/in_1QxYz/);
    expect(() => toOblioDocument('proforma', organization, free)).toThrow();
  });

  it('reverses an invoice in full, refunding its collection', () => {
    expect(toStorno({ seriesName: 'SSMUSOR', number: '0012' }, 're_3QxYz')).toEqual({
      seriesName: 'SSMUSOR',
      referenceDocument: { type: 'Factura', seriesName: 'SSMUSOR', number: '0012', refund: 1 },
      sendEmail: 1,
      spvExtern: 1,
      idempotencyKey: 're_3QxYz',
    });
  });
});
