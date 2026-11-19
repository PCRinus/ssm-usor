import type { DataTableSort } from '@/components/data-table/columns';
import { listSortSearchSchema } from '@/components/list-filters/use-list-search';

import type { BillingOwner } from './use-billing';

export type Invoice = BillingOwner['invoices'][number];

export const invoiceSortKeys = ['issuedAt', 'amount'] as const;
export type InvoiceSortKey = (typeof invoiceSortKeys)[number];
export type InvoiceSort = DataTableSort & { sort: InvoiceSortKey };

export const defaultInvoiceSort: InvoiceSort = { sort: 'issuedAt', order: 'desc' };

// The invoices come whole, so they sort here; the address keeps the choice as on every list.
export const invoiceListSearch = listSortSearchSchema(invoiceSortKeys).shape;

// One still being issued has no date yet and counts as the newest. The API lists the newest
// recorded first, which breaks ties.
export function sortInvoices(invoices: readonly Invoice[], { sort, order }: InvoiceSort) {
  const direction = order === 'asc' ? 1 : -1;
  const valueOf = (invoice: Invoice) =>
    sort === 'amount'
      ? invoice.amountCents
      : invoice.issuedAt
        ? Date.parse(invoice.issuedAt)
        : Number.POSITIVE_INFINITY;
  return invoices
    .map((invoice, index) => ({ invoice, index, value: valueOf(invoice) }))
    .sort((a, b) => {
      if (a.value !== b.value) return (a.value < b.value ? -1 : 1) * direction;
      return sort === 'issuedAt' ? (b.index - a.index) * direction : a.index - b.index;
    })
    .map(({ invoice }) => invoice);
}
