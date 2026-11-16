import { getRouteApi, useRouteContext } from '@tanstack/react-router';
import { Receipt } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { getBillingInvoicePdf } from '@/api/generated/api';
import { keepOpener } from '@/app/opener';
import { DataTable } from '@/components/data-table/data-table';
import { EmptyState, ListEmpty } from '@/components/empty-state';
import { HelpLink } from '@/components/help-link';
import { ListCardHeader, ListCount } from '@/components/list-card-header';
import { Notice } from '@/components/notice';
import { roCount } from '@/features/employees/employee-format';

import { billingErrorMessage } from './billing-errors';
import { invoiceColumns } from './invoice-columns';
import {
  defaultInvoiceSort,
  type Invoice,
  type InvoiceSort,
  type InvoiceSortKey,
  sortInvoices,
} from './invoice-list';
import { leaveFor } from './leave';

const route = getRouteApi('/_authenticated/organizatie/abonament/');

const rowKey = (invoice: Invoice) => invoice.stripeInvoiceId;

export function InvoicesCard({
  invoices,
  vatPayer,
  emptyText,
}: {
  invoices: Invoice[];
  vatPayer: boolean;
  emptyText: string;
}) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const search = route.useSearch();
  const navigate = route.useNavigate();
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sort: InvoiceSort = {
    sort: search.sort ?? defaultInvoiceSort.sort,
    order: search.order ?? defaultInvoiceSort.order,
  };
  const rows = useMemo(
    () => sortInvoices(invoices, { sort: sort.sort, order: sort.order }),
    [invoices, sort.sort, sort.order]
  );

  // A tab opened after the link arrives would be taken for a popup and blocked, so it opens on
  // the click and is pointed at the PDF once the link is there.
  const open = useCallback(
    async (invoice: Invoice) => {
      setError(null);
      setOpening(invoice.stripeInvoiceId);
      const tab = window.open('', '_blank');
      if (tab) tab.opener = null;
      try {
        const link = await getBillingInvoicePdf(invoice.stripeInvoiceId, apiRequest);
        if (tab) tab.location.href = link.url;
        else leaveFor(link.url);
      } catch (cause) {
        tab?.close();
        setError(billingErrorMessage(cause));
      } finally {
        setOpening(null);
      }
    },
    [apiRequest]
  );

  const columns = useMemo(
    () => invoiceColumns({ invoices, vatPayer, opening, onOpen: (invoice) => void open(invoice) }),
    [invoices, vatPayer, opening, open]
  );

  const empty = invoices.length === 0;

  return (
    <section
      data-testid="invoices-card"
      aria-labelledby="invoices-title"
      className="min-w-0 overflow-hidden rounded-xl border bg-card shadow-sm"
    >
      <ListCardHeader className="flex-nowrap max-sm:px-4">
        <div className="flex min-h-9 items-center gap-1">
          <h2 id="invoices-title" className="text-base font-semibold">
            Facturi
          </h2>
          <HelpLink topic="organizatie.plata-si-facturi" label="Ajutor: plată și facturi" />
        </div>
        {!empty && (
          <ListCount testId="invoices-count">
            {roCount(invoices.length, 'factură', 'facturi')}
          </ListCount>
        )}
      </ListCardHeader>
      {error && (
        <div className="border-b px-4 py-3 sm:px-5">
          <Notice variant="destructive">{error}</Notice>
        </div>
      )}
      {empty ? (
        <ListEmpty className="py-8">
          <EmptyState icon={Receipt} title="Nicio factură încă" data-testid="invoices-empty">
            {emptyText}
          </EmptyState>
        </ListEmpty>
      ) : (
        <DataTable
          testId="invoices-table"
          rowTestId="invoice-row"
          label="Facturi"
          columns={columns}
          data={rows}
          rowKey={rowKey}
          status="success"
          sort={sort}
          onSortChange={(next) =>
            void navigate({
              state: keepOpener,
              replace: true,
              resetScroll: false,
              search: (prev) => ({
                ...prev,
                sort:
                  next.sort === defaultInvoiceSort.sort ? undefined : (next.sort as InvoiceSortKey),
                order: next.order === defaultInvoiceSort.order ? undefined : next.order,
              }),
            })
          }
          empty={null}
        />
      )}
    </section>
  );
}
