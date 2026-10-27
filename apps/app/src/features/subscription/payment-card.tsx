import { invoiceEmailSchema } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { Input } from '@ssm-usor/ui/components/input';
import { Label } from '@ssm-usor/ui/components/label';
import { toast } from '@ssm-usor/ui/lib/toast';
import { useRouteContext } from '@tanstack/react-router';
import { ExternalLink } from 'lucide-react';
import { type FormEvent, useState } from 'react';

import { useUpdateInvoiceEmail } from '@/api/generated/api';

import { billingErrorMessage } from './billing-errors';
import { cardBrand } from './billing-format';
import { BillingCard } from './billing-ui';
import { type BillingOwner, refreshBilling } from './use-billing';

export function PaymentCard({
  owner,
  refused,
  canAct,
  changingCard,
  onChangeCard,
}: {
  owner: BillingOwner;
  refused: boolean;
  canAct: boolean;
  changingCard: boolean;
  onChangeCard: () => void;
}) {
  const card = owner.card;
  const brand = card ? cardBrand(card.brand) : null;

  return (
    <BillingCard
      title="Plată și facturi"
      help="organizatie.plata-si-facturi"
      data-testid="payment-card"
    >
      {card && brand ? (
        <div className="grid gap-2.5">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="grid h-[30px] w-11 shrink-0 place-items-center rounded-md border bg-muted/60 text-[10px] font-bold tracking-wide"
            >
              {brand.short}
            </span>
            <div className="grid min-w-0 flex-1 gap-0.5">
              <span data-testid="payment-card-number" className="text-sm font-medium">
                {brand.name} •••• {card.last4}
              </span>
              <span className="text-[13px] text-muted-foreground">
                Expiră în {String(card.expMonth).padStart(2, '0')}/{card.expYear}
              </span>
            </div>
            {refused && (
              <span className="rounded-full border border-destructive-border bg-destructive-soft px-2 py-0.5 text-xs font-semibold text-destructive-foreground">
                Refuzat
              </span>
            )}
          </div>
          <Button
            variant="link"
            className="h-9 w-fit px-0 font-semibold"
            disabled={!canAct || changingCard}
            onClick={onChangeCard}
          >
            {changingCard ? 'Se deschide…' : 'Schimbă cardul'}
            <ExternalLink aria-hidden="true" />
          </Button>
        </div>
      ) : (
        <p className="text-sm leading-relaxed text-muted-foreground">
          Nu ai salvat un card. Îl adaugi când alegi planul.
        </p>
      )}
      <InvoiceEmailForm
        key={owner.invoiceEmail ?? ''}
        saved={owner.invoiceEmail}
        ownerEmail={owner.ownerEmail}
        canAct={canAct}
      />
    </BillingCard>
  );
}

function InvoiceEmailForm({
  saved,
  ownerEmail,
  canAct,
}: {
  saved: string | null;
  ownerEmail: string | null;
  canAct: boolean;
}) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const update = useUpdateInvoiceEmail({ request: apiRequest });
  const [value, setValue] = useState(saved ?? '');
  const [error, setError] = useState<string | null>(null);
  const trimmed = value.trim();
  const changed = trimmed !== (saved ?? '');

  async function save(event: FormEvent) {
    event.preventDefault();
    const parsed = invoiceEmailSchema.safeParse({ email: trimmed === '' ? null : trimmed });
    if (!parsed.success) {
      setError('Scrie o adresă de email validă, de exemplu contabilitate@firma.ro.');
      return;
    }
    setError(null);
    try {
      await update.mutateAsync({ data: parsed.data });
      toast.success(
        parsed.data.email
          ? `Facturile pleacă de acum la ${parsed.data.email}.`
          : 'Facturile pleacă de acum la adresa ta.'
      );
      await refreshBilling(queryClient);
    } catch (cause) {
      setError(billingErrorMessage(cause));
    }
  }

  const fallback = ownerEmail ? `adresa ta, ${ownerEmail}` : 'adresa ta';
  const hint = saved
    ? `Facturile pleacă la această adresă. Dacă o ștergi, le trimitem la ${fallback}.`
    : `Dacă lași gol, facturile pleacă la ${fallback}.`;

  return (
    <form
      noValidate
      onSubmit={(event) => void save(event)}
      className="grid gap-1.5 border-t pt-3.5"
    >
      <Label htmlFor="invoice-email" className="text-sm font-medium">
        Email pentru facturi
        <span className="font-normal text-muted-foreground">(opțional)</span>
      </Label>
      <div className="flex gap-2">
        <Input
          id="invoice-email"
          data-testid="invoice-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="contabilitate@firma.ro"
          value={value}
          disabled={!canAct || update.isPending}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'invoice-email-error' : 'invoice-email-hint'}
          onChange={(event) => setValue(event.target.value)}
          className="h-10 min-w-0 flex-1"
        />
        <Button
          type="submit"
          variant="outline"
          data-testid="invoice-email-save"
          className="h-10 font-semibold"
          disabled={!canAct || !changed || update.isPending}
        >
          {update.isPending ? 'Se salvează…' : 'Salvează'}
        </Button>
      </div>
      {error ? (
        <p id="invoice-email-error" role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : (
        <p id="invoice-email-hint" className="text-[13px] leading-relaxed text-muted-foreground">
          {hint}
        </p>
      )}
    </form>
  );
}
