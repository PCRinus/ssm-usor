import { Button } from '@ssm-usor/ui/components/button';
import { Download, LoaderCircle } from 'lucide-react';

import { CellEmpty, CellNote } from '@/components/data-table/cell-note';
import { createDataTableColumns, type DataTableColumn } from '@/components/data-table/columns';

import { formatEuro } from './billing-format';
import type { Invoice } from './invoice-list';
import { roDate } from './subscription-copy';

const helper = createDataTableColumns<Invoice>();

function amountOf(cents: number, currency: string) {
  return currency.toLowerCase() === 'eur'
    ? formatEuro(cents)
    : `${(cents / 100).toFixed(2).replace('.', ',')} ${currency.toUpperCase()}`;
}

function noteOf(invoice: Invoice, numbers: ReadonlyMap<string, string | null>) {
  if (invoice.stornoOf) {
    const original = numbers.get(invoice.stornoOf);
    return original ? `Stornare a facturii ${original}` : 'Stornare';
  }
  return invoice.kind === 'proforma' ? 'Proformă de test' : null;
}

// Sortable column ids are the list's sort keys.
export function invoiceColumns({
  invoices,
  vatPayer,
  opening,
  onOpen,
}: {
  invoices: readonly Invoice[];
  vatPayer: boolean;
  opening: string | null;
  onOpen: (invoice: Invoice) => void;
}): DataTableColumn<Invoice>[] {
  const numbers = new Map(invoices.map((invoice) => [invoice.stripeInvoiceId, invoice.number]));
  return helper.columns([
    helper.display({
      id: 'number',
      header: 'Factura',
      meta: { headerClassName: 'w-full min-w-60', skeletonClassName: 'w-32' },
      cell: ({ row }) => {
        const invoice = row.original;
        const note = noteOf(invoice, numbers);
        return (
          <>
            {invoice.number ? (
              <span className="font-medium tabular-nums">{invoice.number}</span>
            ) : (
              'Se emite'
            )}
            {note && <CellNote data-testid="invoice-note">{note}</CellNote>}
          </>
        );
      },
    }),
    helper.accessor((invoice) => invoice.issuedAt, {
      id: 'issuedAt',
      header: 'Data',
      meta: { headerClassName: 'min-w-42 sm:min-w-50', skeletonClassName: 'w-20' },
      cell: ({ row }) =>
        row.original.issuedAt ? (
          <span className="tabular-nums">{roDate(row.original.issuedAt)}</span>
        ) : (
          <CellEmpty />
        ),
    }),
    helper.accessor((invoice) => invoice.amountCents, {
      id: 'amount',
      header: 'Suma, cu TVA',
      meta: {
        headerClassName:
          'min-w-34 text-right sm:min-w-40 [&>button]:-mr-3 [&>button]:ml-0 [&>button]:text-right',
        cellClassName: 'text-right',
        skeletonClassName: 'ml-auto w-16',
      },
      cell: ({ row }) => {
        const invoice = row.original;
        return (
          <>
            <span className="tabular-nums" data-testid="invoice-amount">
              {amountOf(invoice.amountCents, invoice.currency)}
            </span>
            {vatPayer && invoice.subtotalCents !== null && (
              <CellNote className="tabular-nums" data-testid="invoice-net">
                fără TVA {amountOf(invoice.subtotalCents, invoice.currency)}
              </CellNote>
            )}
          </>
        );
      },
    }),
    helper.display({
      id: 'pdf',
      header: () => <span className="sr-only">PDF</span>,
      meta: {
        headerClassName: 'min-w-30 sm:min-w-32',
        cellClassName: 'py-1 text-right',
        skeletonClassName: 'ml-auto w-9',
      },
      cell: ({ row }) => {
        const invoice = row.original;
        if (!invoice.hasPdf) {
          return (
            <span data-testid="invoice-pdf-pending" className="text-[13px] whitespace-nowrap">
              PDF în curând
            </span>
          );
        }
        const busy = opening === invoice.stripeInvoiceId;
        return (
          <Button
            variant="ghost"
            size="icon"
            data-testid="invoice-download"
            aria-label={`Descarcă PDF-ul facturii ${invoice.number ?? ''}`.trim()}
            disabled={busy}
            onClick={() => onOpen(invoice)}
          >
            {busy ? (
              <LoaderCircle aria-hidden="true" className="animate-spin" />
            ) : (
              <Download aria-hidden="true" />
            )}
          </Button>
        );
      },
    }),
  ]);
}
