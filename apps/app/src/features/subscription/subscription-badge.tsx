import type { SubscriptionSummary } from '@ssm-usor/contracts';
import { Popover, PopoverContent, PopoverTrigger } from '@ssm-usor/ui/components/popover';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Clock, Layers, Lock, type LucideIcon, ShieldCheck, Sprout } from 'lucide-react';

import {
  contactEmail,
  daysLeftLabel,
  daysUntil,
  endedSentence,
  planNames,
  pricingUrl,
  roDate,
  sealFor,
  type SealKind,
} from './subscription-copy';

const sealLooks: Record<SealKind, { icon: LucideIcon; className: string; iconClassName?: string }> =
  {
    trial: {
      icon: Clock,
      className:
        'border border-dashed border-success-foreground/45 bg-success text-success-foreground',
    },
    start: { icon: Sprout, className: 'border border-input bg-card text-foreground' },
    profesional: {
      icon: ShieldCheck,
      className: 'bg-primary text-primary-foreground',
      iconClassName: 'text-accent',
    },
    enterprise: {
      icon: Layers,
      className:
        'bg-primary text-primary-foreground ring-[1.5px] ring-accent ring-offset-2 ring-offset-card',
      iconClassName: 'text-accent',
    },
    readOnly: {
      icon: Lock,
      className: 'border border-warning-border bg-warning text-warning-foreground',
    },
  };

export function SubscriptionBadge({
  subscription,
  isOwner,
  impersonating,
  className,
}: {
  subscription: SubscriptionSummary;
  isOwner: boolean;
  // Support acting as the owner is not told to write to itself.
  impersonating: boolean;
  className?: string;
}) {
  const seal = sealFor(subscription);
  const look = sealLooks[seal.kind];
  const Icon = look.icon;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="subscription-badge"
          data-seal={seal.kind}
          aria-label={`${seal.label}: detaliile abonamentului`}
          className={cn(
            'inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold whitespace-nowrap outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:px-3 sm:text-[13px]',
            look.className,
            className
          )}
        >
          <Icon aria-hidden="true" className={cn('size-3.5', look.iconClassName)} />
          {seal.label}
          {seal.attention && (
            <span aria-hidden="true" className="size-2 rounded-full bg-warning-border" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        data-testid="subscription-details"
        className="w-[calc(100vw-2rem)] rounded-xl p-4 sm:w-[340px]"
      >
        <SubscriptionDetails
          subscription={subscription}
          canAct={isOwner && !impersonating}
          impersonating={impersonating}
        />
      </PopoverContent>
    </Popover>
  );
}

function SubscriptionDetails({
  subscription,
  canAct,
  impersonating,
}: {
  subscription: SubscriptionSummary;
  canAct: boolean;
  impersonating: boolean;
}) {
  const plan = planNames[subscription.plan];
  const readOnly = subscription.access === 'read_only';
  const trial = subscription.status === 'trialing' && !readOnly && subscription.trialEndsAt;

  let title = plan;
  let lines: string[];
  if (readOnly) {
    title = 'Doar citire';
    lines = [
      endedSentence(subscription),
      `Vezi și descarci tot${subscription.deletesAt ? ` până pe ${roDate(subscription.deletesAt)}` : ''}; apoi datele se șterg.`,
    ];
  } else if (trial) {
    title = 'Perioada de probă';
    const days = daysUntil(trial);
    lines = [
      days <= 1
        ? `Se încheie ${days === 0 ? 'azi' : 'mâine'}, pe ${roDate(trial)}. Ai tot ce include Profesional.`
        : `Mai ai ${daysLeftLabel(days)}, până pe ${roDate(trial)}. Ai tot ce include Profesional.`,
      'După aceea, contul rămâne 30 de zile doar pentru citire.',
    ];
  } else if (subscription.status === 'past_due') {
    lines = [
      'Plata abonamentului nu a reușit. Reîncercăm automat.',
      `Dacă nu reușește, contul trece în modul doar citire${subscription.accessUntil ? ` pe ${roDate(subscription.accessUntil)}` : ''}.`,
    ];
  } else if (subscription.status === 'canceled' && subscription.accessUntil) {
    lines = [
      `Abonamentul a fost anulat și rămâne activ până pe ${roDate(subscription.accessUntil)}.`,
    ];
  } else {
    lines = ['Abonament activ.'];
  }

  return (
    <div className="grid gap-3 text-sm">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-semibold">{title}</p>
        {trial && <span className="text-xs text-muted-foreground">Profesional</span>}
      </div>
      {lines.map((line) => (
        <p key={line} className="leading-relaxed text-muted-foreground first:text-foreground">
          {line}
        </p>
      ))}
      {canAct && (readOnly || trial || subscription.status === 'past_due') && (
        <div className="flex flex-wrap items-center gap-3">
          <a
            href={`mailto:${contactEmail}`}
            className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Scrie-ne ca să continui
          </a>
          <a href={pricingUrl} target="_blank" rel="noreferrer" className="underline">
            Vezi prețurile
          </a>
        </div>
      )}
      {!canAct && !impersonating && (readOnly || trial || subscription.status === 'past_due') && (
        <p className="text-muted-foreground">Administratorul organizației se ocupă de abonament.</p>
      )}
    </div>
  );
}
