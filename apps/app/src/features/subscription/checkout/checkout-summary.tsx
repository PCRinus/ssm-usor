import {
  type BillingChoice,
  billingPlans,
  type BillingPreview,
  vatPercent,
} from '@ssm-usor/contracts';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { cn } from '@ssm-usor/ui/lib/utils';
import type { ReactNode } from 'react';

import { choiceAmounts, formatCount, formatEuro, perInterval } from '../billing-format';
import { roDate } from '../subscription-copy';
import type { CheckoutMode } from './checkout-choice';

interface When {
  tone: 'success' | 'info' | 'plain';
  title: string;
  text: string;
}

function whenFor(
  mode: CheckoutMode,
  preview: BillingPreview,
  context: { inTrial: boolean; readOnly: boolean }
): When {
  const due = preview.dueToday.totalCents;
  const next = preview.nextRenewal;
  const renews =
    preview.choice.interval === 'month'
      ? `Abonamentul se reînnoiește în fiecare lună, pe ${new Date(next.at).getDate()}.`
      : `Abonamentul se reînnoiește pe ${roDate(next.at)}.`;

  if (mode === 'new') {
    if (due === 0) {
      return {
        tone: 'success',
        title: 'Azi nu plătești nimic.',
        text: `Cardul se salvează acum. Prima plată, de ${formatEuro(next.totalCents)}, se face pe ${roDate(preview.firstChargeAt)}, când se încheie perioada de probă. La prima plată primești ${formatCount(billingPlans[preview.choice.plan].welcomeCredits)} de credite de bun venit.`,
      };
    }
    return {
      tone: 'info',
      title: `Plătești azi ${formatEuro(due)}.`,
      text: context.readOnly
        ? `${renews} Contul revine la acces complet imediat după plată.`
        : renews,
    };
  }

  if (preview.unchanged) {
    return {
      tone: 'plain',
      title: 'Asta ai acum.',
      text: 'Schimbă planul, perioada sau cantitățile ca să vezi diferența.',
    };
  }
  if (context.inTrial) {
    return {
      tone: 'success',
      title: 'Se aplică acum. Azi nu plătești nimic.',
      text: `Prima plată, de ${formatEuro(next.totalCents)}, se face pe ${roDate(preview.firstChargeAt)}.`,
    };
  }
  if (due > 0) {
    return {
      tone: 'info',
      title: `Plătești azi ${formatEuro(due)}.`,
      text: `Partea nefolosită din ce ai acum se scade. Următoarea plată: ${formatEuro(next.totalCents)}, pe ${roDate(next.at)}.`,
    };
  }
  if (new Date(preview.appliesAt).getTime() > Date.now() + 60_000) {
    return {
      tone: 'info',
      title: `Se aplică pe ${roDate(preview.appliesAt)}.`,
      text: 'Până atunci păstrezi ce ai acum, iar perioada plătită nu se returnează.',
    };
  }
  return {
    tone: 'info',
    title: 'Se aplică azi.',
    text: `Diferența pentru zilele rămase apare pe factura din ${roDate(next.at)}: ${formatEuro(next.totalCents)} cu TVA.`,
  };
}

const tones = {
  success: 'border-success-border bg-success text-success-foreground',
  info: 'border-info-border bg-info text-info-foreground',
  plain: 'border-border bg-muted/60 text-foreground',
} as const;

export function CheckoutSummary({
  mode,
  choice,
  preview,
  settling,
  inTrial,
  readOnly,
  children,
}: {
  mode: CheckoutMode;
  choice: BillingChoice;
  preview: BillingPreview | undefined;
  settling: boolean;
  inTrial: boolean;
  readOnly: boolean;
  children: ReactNode;
}) {
  const amounts = choiceAmounts(choice);
  const refused = (preview?.problems.length ?? 0) > 0;
  const when =
    preview && !settling && !refused ? whenFor(mode, preview, { inTrial, readOnly }) : null;

  return (
    <aside
      aria-labelledby="checkout-summary"
      data-testid="checkout-summary"
      className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-sm sm:p-6 lg:sticky lg:top-24"
    >
      <h2 id="checkout-summary" className="text-base font-semibold">
        Rezumat
      </h2>
      <dl className="grid gap-2 text-sm">
        {amounts.lines.map((line) => (
          <div key={line.label} className="flex justify-between gap-4 text-muted-foreground">
            <dt className="min-w-0">{line.label}</dt>
            <dd className="whitespace-nowrap tabular-nums">{formatEuro(line.amountCents)}</dd>
          </div>
        ))}
        <div className="flex justify-between gap-4 border-t pt-2">
          <dt>Subtotal</dt>
          <dd className="tabular-nums">{formatEuro(amounts.subtotalCents)}</dd>
        </div>
        <div className="flex justify-between gap-4 text-muted-foreground">
          <dt>TVA {vatPercent} %</dt>
          <dd className="tabular-nums">{formatEuro(amounts.vatCents)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 border-t pt-2">
          <dt className="text-[15px] font-semibold">Total {perInterval[choice.interval]}</dt>
          <dd
            data-testid="checkout-total"
            className="text-[22px] font-bold tracking-tight tabular-nums"
          >
            {formatEuro(amounts.totalCents)}
          </dd>
        </div>
      </dl>
      {when ? (
        <div
          role="status"
          data-testid="checkout-when"
          className={cn('grid gap-1 rounded-xl border px-3.5 py-3', tones[when.tone])}
        >
          <strong className="text-sm font-semibold">{when.title}</strong>
          <p className="text-sm leading-relaxed">{when.text}</p>
        </div>
      ) : refused ? null : (
        <Skeleton className="h-20 w-full" />
      )}
      {children}
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        Îl anulezi oricând din pagina Abonament. Planul merge până la capătul perioadei plătite, iar
        banii nu se returnează. Factura vine pe email.
      </p>
    </aside>
  );
}
