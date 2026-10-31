import type { SubscriptionSummary } from '@ssm-usor/contracts';
import { Popover, PopoverContent, PopoverTrigger } from '@ssm-usor/ui/components/popover';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';

import { sealLooks } from './seal-looks';
import {
  daysLeftLabel,
  daysUntil,
  endedSentence,
  ownerActionFor,
  planNames,
  pricingUrl,
  roDate,
  sealFor,
  subscriptionPath,
} from './subscription-copy';

const chip =
  'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold whitespace-nowrap';

function SealParts({ subscription }: { subscription: SubscriptionSummary }) {
  const seal = sealFor(subscription);
  const look = sealLooks[seal.kind];
  const Icon = look.icon;
  return (
    <>
      <Icon aria-hidden="true" className={cn('size-3.5', look.iconClassName)} />
      {seal.label}
      {seal.attention && (
        <span aria-hidden="true" className="size-2 rounded-full bg-warning-border" />
      )}
    </>
  );
}

export function SubscriptionSeal({
  subscription,
  className,
}: {
  subscription: SubscriptionSummary;
  className?: string;
}) {
  const seal = sealFor(subscription);
  return (
    <span
      data-testid="subscription-seal"
      data-seal={seal.kind}
      className={cn(chip, 'h-7', sealLooks[seal.kind].className, className)}
    >
      <SealParts subscription={subscription} />
    </span>
  );
}

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
  const [open, setOpen] = useState(false);
  const seal = sealFor(subscription);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="subscription-badge"
          data-seal={seal.kind}
          aria-label={`${seal.label}: detaliile abonamentului`}
          className={cn(
            chip,
            'h-8 cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:px-3 sm:text-[13px]',
            sealLooks[seal.kind].className,
            className
          )}
        >
          <SealParts subscription={subscription} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        collisionPadding={16}
        data-testid="subscription-details"
        className="w-[calc(100vw-2rem)] rounded-xl p-4 sm:w-[340px]"
      >
        <SubscriptionDetails
          subscription={subscription}
          canAct={isOwner && !impersonating}
          impersonating={impersonating}
          onNavigate={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}

function SubscriptionDetails({
  subscription,
  canAct,
  impersonating,
  onNavigate,
}: {
  subscription: SubscriptionSummary;
  canAct: boolean;
  impersonating: boolean;
  onNavigate: () => void;
}) {
  const plan = planNames[subscription.plan];
  const readOnly = subscription.access === 'read_only';
  const trialing = subscription.status === 'trialing' && !readOnly && subscription.trialEndsAt;
  const trial = trialing && !subscription.planChosen ? trialing : null;
  const chosen = trialing && subscription.planChosen ? trialing : null;

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
  } else if (chosen) {
    title = `Ai ales ${plan}`;
    lines = [`Proba continuă până pe ${roDate(chosen)}. Prima plată e în aceeași zi.`];
  } else if (subscription.status === 'past_due') {
    lines = [
      'Plata abonamentului nu a reușit. Reîncercăm automat.',
      `Dacă nu reușește, contul trece în modul doar citire${subscription.accessUntil ? ` pe ${roDate(subscription.accessUntil)}` : ''}.`,
    ];
  } else if (subscription.accessUntil) {
    lines = [
      `Abonamentul a fost anulat și rămâne activ până pe ${roDate(subscription.accessUntil)}.`,
    ];
  } else {
    lines = ['Abonament activ.'];
  }
  const needsOwner = readOnly || Boolean(trial) || subscription.status === 'past_due';
  const action = ownerActionFor(subscription);

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
      {canAct ? (
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to={subscriptionPath}
            onClick={onNavigate}
            className={cn(
              'inline-flex h-10 items-center rounded-lg px-4 text-sm font-semibold',
              action.urgent
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'border border-input bg-card hover:bg-muted'
            )}
          >
            {action.label}
          </Link>
          {trial && (
            <a href={pricingUrl} target="_blank" rel="noreferrer" className="underline">
              Vezi prețurile
            </a>
          )}
        </div>
      ) : (
        <>
          {!impersonating && needsOwner && (
            <p className="text-muted-foreground">
              Administratorul organizației se ocupă de abonament.
            </p>
          )}
          <Link to={subscriptionPath} onClick={onNavigate} className="w-fit underline">
            Vezi abonamentul
          </Link>
        </>
      )}
    </div>
  );
}
