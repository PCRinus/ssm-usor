import { Button } from '@ssm-usor/ui/components/button';
import { useRouteContext } from '@tanstack/react-router';
import { Download } from 'lucide-react';
import { useState } from 'react';

import { getBillingInvoicePdf } from '@/api/generated/api';
import { Notice } from '@/components/notice';

import { billingErrorMessage } from './billing-errors';
import { formatEuro } from './billing-format';
import { BillingCard } from './billing-ui';
import { leaveFor } from './leave';
import { roDate } from './subscription-copy';
import type { BillingOwner } from './use-billing';

type Invoice = BillingOwner['invoices'][number];

function kindLabel(invoice: Invoice) {
  if (invoice.stornoOf || invoice.amountCents < 0) return 'Stornare';
  return invoice.kind === 'proforma' ? 'Proformă de test' : 'Factură';
}

function amountOf(invoice: Invoice) {
  return invoice.currency.toLowerCase() === 'eur'
    ? formatEuro(invoice.amountCents)
    : `${(invoice.amountCents / 100).toFixed(2).replace('.', ',')} ${invoice.currency.toUpperCase()}`;
}

export function InvoicesCard({ invoices, emptyText }: { invoices: Invoice[]; emptyText: string }) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A tab opened after the link arrives would be taken for a popup and blocked, so it opens on
  // the click and is pointed at the PDF once the link is there.
  async function open(invoice: Invoice) {
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
  }

  const download = (invoice: Invoice) => {
    const pending = !invoice.hasPdf;
    return (
      <Button
        variant="link"
        className="h-9 px-0 font-semibold"
        data-testid="invoice-download"
        disabled={pending || opening === invoice.stripeInvoiceId}
        title={pending ? 'PDF-ul se pregătește. Revino peste câteva minute.' : undefined}
        onClick={() => void open(invoice)}
      >
        <Download aria-hidden="true" />
        {pending ? 'PDF în curând' : 'Descarcă PDF'}
      </Button>
    );
  };

  return (
    <BillingCard
      title="Facturi"
      aside="Fiecare factură vine și pe email."
      data-testid="invoices-card"
      className="pb-2 sm:pb-2"
    >
      {error && <Notice variant="destructive">{error}</Notice>}
      {invoices.length === 0 ? (
        <p className="border-t pt-5 pb-2 text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <>
          <div role="table" aria-label="Facturi" className="hidden text-sm md:grid">
            <div
              role="row"
              className="grid grid-cols-[170px_120px_minmax(0,1fr)_130px_160px] gap-4 border-t py-2 text-xs font-medium text-muted-foreground"
            >
              <span role="columnheader">Număr</span>
              <span role="columnheader">Data</span>
              <span role="columnheader">Document</span>
              <span role="columnheader" className="text-right">
                Suma, cu TVA
              </span>
              <span role="columnheader" className="text-right">
                PDF
              </span>
            </div>
            {invoices.map((invoice) => (
              <div
                key={invoice.stripeInvoiceId}
                role="row"
                data-testid="invoice-row"
                className="grid min-h-12 grid-cols-[170px_120px_minmax(0,1fr)_130px_160px] items-center gap-4 border-t"
              >
                <span role="cell" className="font-medium tabular-nums">
                  {invoice.number ?? 'Se emite'}
                </span>
                <span role="cell" className="text-muted-foreground tabular-nums">
                  {invoice.issuedAt ? roDate(invoice.issuedAt) : '—'}
                </span>
                <span role="cell" className="min-w-0 text-muted-foreground">
                  {kindLabel(invoice)}
                </span>
                <span role="cell" className="text-right font-medium tabular-nums">
                  {amountOf(invoice)}
                </span>
                <span role="cell" className="text-right">
                  {download(invoice)}
                </span>
              </div>
            ))}
          </div>
          <ul className="grid md:hidden">
            {invoices.map((invoice) => (
              <li key={invoice.stripeInvoiceId} className="grid gap-1 border-t py-3">
                <div className="flex justify-between gap-3 text-sm font-semibold tabular-nums">
                  <span>{invoice.number ?? 'Se emite'}</span>
                  <span>{amountOf(invoice)}</span>
                </div>
                <p className="text-[13px] text-muted-foreground">
                  {invoice.issuedAt ? `${roDate(invoice.issuedAt)} · ` : ''}
                  {kindLabel(invoice)}
                </p>
                <div>{download(invoice)}</div>
              </li>
            ))}
          </ul>
        </>
      )}
    </BillingCard>
  );
}
