import type { BillingSmsUsage, SubscriptionSummary } from '@ssm-usor/contracts';
import { Popover, PopoverContent, PopoverTrigger } from '@ssm-usor/ui/components/popover';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';

import { formatCount } from './billing-format';
import { UsageBar } from './billing-ui';
import { toneInks } from './meter-tones';
import { sealLooks } from './seal-looks';
import { codesLabel, smsMeterFor, stopOf } from './sms-copy';
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

function SealParts({
  subscription,
  alert = false,
}: {
  subscription: SubscriptionSummary;
  alert?: boolean;
}) {
  const seal = sealFor(subscription);
  const look = sealLooks[seal.kind];
  const Icon = look.icon;
  return (
    <>
      <Icon aria-hidden="true" className={cn('size-3.5', look.iconClassName)} />
      {seal.label}
      {(seal.attention || alert) && (
        <span
          aria-hidden="true"
          data-testid="subscription-badge-alert"
          className="size-2 rounded-full bg-warning-border"
        />
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
  sms,
  isOwner,
  impersonating,
  className,
}: {
  subscription: SubscriptionSummary;
  sms: BillingSmsUsage | null;
  isOwner: boolean;
  // Support acting as the owner is not told to write to itself.
  impersonating: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const seal = sealFor(subscription);
  const smsStopped =
    subscription.access === 'full' && (sms?.state === 'capped' || sms?.state === 'stopped');

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="subscription-badge"
          data-seal={seal.kind}
          aria-label={`${seal.label}${smsStopped ? ', codurile SMS oprite' : ''}: detaliile abonamentului`}
          className={cn(
            chip,
            'h-8 cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:px-3 sm:text-[13px]',
            sealLooks[seal.kind].className,
            className
          )}
        >
          <SealParts subscription={subscription} alert={smsStopped} />
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
          sms={sms}
          isOwner={isOwner}
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
  sms,
  isOwner,
  canAct,
  impersonating,
  onNavigate,
}: {
  subscription: SubscriptionSummary;
  sms: BillingSmsUsage | null;
  isOwner: boolean;
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
  let smsNote: string | null = null;
  if (!readOnly && sms?.state === 'none') {
    smsNote = 'În perioada de probă totul pleacă pe email; SMS-urile pornesc când alegi un plan.';
  } else if (!readOnly && sms && sms.included !== null && sms.cap === null) {
    smsNote = chosen
      ? `Până la prima plată, codurile se opresc la ${formatCount(sms.included)}.`
      : `Cont de test: după ${codesLabel(sms.included)} pe lună, codurile pleacă pe email.`;
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
      {!readOnly && sms && sms.included !== null && sms.state !== 'none' && (
        <SmsMeterLine sms={sms} owner={isOwner} planChosen={subscription.planChosen} />
      )}
      {smsNote && (
        <p
          data-testid="subscription-details-sms-note"
          className="leading-relaxed text-muted-foreground"
        >
          {smsNote}
        </p>
      )}
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

function SmsMeterLine({
  sms,
  owner,
  planChosen,
}: {
  sms: BillingSmsUsage;
  owner: boolean;
  planChosen: boolean;
}) {
  const meter = smsMeterFor(sms, { owner, stop: stopOf(sms, planChosen) });
  if (meter.used === null || meter.limit === null) return null;
  const label = 'Coduri de semnare prin SMS';
  return (
    <div data-testid="subscription-details-sms" data-state={sms.state} className="grid gap-1">
      <div className="flex justify-between gap-3 text-[13px]">
        <span>{label}</span>
        <span className={cn('tabular-nums', toneInks[meter.tone] ?? 'text-muted-foreground')}>
          {formatCount(meter.used)} / {formatCount(meter.limit)}
        </span>
      </div>
      <UsageBar
        used={meter.used}
        limit={meter.limit}
        label={label}
        tone={meter.tone}
        className="h-1.5"
      />
    </div>
  );
}
