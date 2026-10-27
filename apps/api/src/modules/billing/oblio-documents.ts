import { type CountyCode, countyNames } from '@ssm-usor/contracts';

import type {
  OblioClientDetails,
  OblioDocument,
  OblioDocumentRequest,
  OblioInvoicePayload,
  OblioProduct,
  OblioProformaPayload,
  OblioStornoPayload,
} from './oblio';

// Production issues invoices; non-prod issues proformas, since Oblio has no test mode (ADR 029).
export type OblioDocuments = 'invoice' | 'proforma';

export const invoiceSeries = 'SSMUSOR';
export const proformaSeries = 'TEST';
export const vatPercentage = 21;

export const testClient: OblioClientDetails = {
  name: 'Client test SSM Ușor (non-prod)',
  address: 'Document de test, fără valoare fiscală',
  state: 'București',
  city: 'Sectorul 1',
  country: 'Romania',
  vatPayer: 0,
  save: 0,
  autocomplete: 0,
};

export type BillingOrganization = {
  name: string;
  cui: string;
  registryNumber: string | null;
  countyCode: string | null;
  locality: string | null;
  addressLine: string | null;
  vatPayer: boolean;
  // The organization's email for invoices when it has one, otherwise the owner's.
  recipientEmail: string;
};

export type PaidInvoiceLine = {
  description: string;
  // Euro cents, before VAT.
  unitAmount: number;
  quantity: number;
  period: { start: Date; end: Date } | null;
};

export type PaidStripeInvoice = {
  id: string;
  lines: PaidInvoiceLine[];
  // Euro cents charged to the card, VAT included.
  total: number;
  // The charge or payment intent id, printed as the collection's document number.
  paymentReference: string;
  paidAt: Date;
};

export const shouldIssue = (invoice: Pick<PaidStripeInvoice, 'total'>) => invoice.total > 0;

const romanianDate = new Intl.DateTimeFormat('ro-RO', {
  timeZone: 'Europe/Bucharest',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const euros = (cents: number) => Math.round(cents) / 100;

function products(lines: PaidInvoiceLine[]): OblioProduct[] {
  return lines.map((line) => ({
    name: line.description,
    ...(line.period && {
      description: `Perioada ${romanianDate.format(line.period.start)} – ${romanianDate.format(line.period.end)}`,
    }),
    price: euros(line.unitAmount),
    measuringUnit: 'buc',
    currency: 'EUR',
    vatName: 'Normala',
    vatPercentage,
    vatIncluded: 0,
    quantity: line.quantity,
    productType: 'Serviciu',
  }));
}

function realClient(organization: BillingOrganization): OblioClientDetails {
  const county = organization.countyCode
    ? countyNames[organization.countyCode as CountyCode]
    : undefined;
  return {
    name: organization.name,
    cif: organization.cui,
    ...(organization.registryNumber && { rc: organization.registryNumber }),
    ...(organization.addressLine && { address: organization.addressLine }),
    ...(county && { state: county }),
    ...(organization.locality && { city: organization.locality }),
    country: 'Romania',
    email: organization.recipientEmail,
    vatPayer: organization.vatPayer ? 1 : 0,
    save: 1,
    autocomplete: 0,
  };
}

export function toOblioDocument(
  documents: OblioDocuments,
  organization: BillingOrganization,
  invoice: PaidStripeInvoice
): OblioDocumentRequest {
  if (!shouldIssue(invoice)) {
    throw new Error(`Stripe invoice ${invoice.id} is for nothing; it gets no Oblio document.`);
  }
  if (documents === 'proforma') {
    const payload: OblioProformaPayload = {
      client: testClient,
      seriesName: proformaSeries,
      language: 'RO',
      currency: 'EUR',
      products: products(invoice.lines),
      mentions: `Proformă de test, fără valoare fiscală, pentru ${organization.name}.`,
      internalNote: `Stripe ${invoice.id}`,
      sendEmail: 0,
      idempotencyKey: invoice.id,
    };
    return { kind: 'proforma', payload };
  }
  const payload: OblioInvoicePayload = {
    client: realClient(organization),
    seriesName: invoiceSeries,
    language: 'RO',
    currency: 'EUR',
    products: products(invoice.lines),
    internalNote: `Stripe ${invoice.id}`,
    sendEmail: 1,
    spvExtern: 1,
    // Recorded as collected by card until the accountant answers #628.
    collect: {
      type: 'Card',
      documentNumber: invoice.paymentReference,
      value: euros(invoice.total),
    },
    idempotencyKey: invoice.id,
  };
  return { kind: 'invoice', payload };
}

export function toStorno(
  original: Pick<OblioDocument, 'seriesName' | 'number'>,
  idempotencyKey: string
): OblioStornoPayload {
  return {
    seriesName: original.seriesName,
    referenceDocument: {
      type: 'Factura',
      seriesName: original.seriesName,
      number: original.number,
      refund: 1,
    },
    sendEmail: 1,
    spvExtern: 1,
    idempotencyKey,
  };
}
