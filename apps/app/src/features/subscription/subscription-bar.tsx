import type { BillingSmsUsage, SubscriptionSummary } from '@ssm-usor/contracts';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Link } from '@tanstack/react-router';
import { Clock, Lock, MessageSquareText, TriangleAlert, X } from 'lucide-react';
import { type ReactNode, useState } from 'react';

import { dateToIso } from '@/lib/dates';

import { smsBarFor, stopOf } from './sms-copy';
import { barFor, ownerActionFor, subscriptionPath } from './subscription-copy';

const dismissedKeys = {
  trial: 'ssm-usor.trial-bar-dismissed',
  sms: 'ssm-usor.sms-bar-dismissed',
} as const;
type Dismissable = keyof typeof dismissedKeys;

// Closing hides the bar for the rest of the day; it comes back tomorrow. The bars that cannot be
// closed (the trial's last day, SMS past what is included) ignore it.
function dismissedToday(bar: Dismissable) {
  try {
    return localStorage.getItem(dismissedKeys[bar]) === dateToIso(new Date());
  } catch {
    return false;
  }
}

function dismissForToday(bar: Dismissable) {
  try {
    localStorage.setItem(dismissedKeys[bar], dateToIso(new Date()));
  } catch {
    // Private browsing without storage: the bar closes for this page view only.
  }
}

const tones = {
  trial: { icon: Clock, className: 'border-success-border bg-success text-success-foreground' },
  pastDue: {
    icon: TriangleAlert,
    className: 'border-warning-border bg-warning text-warning-foreground',
  },
  readOnly: { icon: Lock, className: 'border-warning-border bg-warning text-warning-foreground' },
  sms: {
    icon: MessageSquareText,
    className: 'border-warning-border bg-warning text-warning-foreground',
  },
  smsStop: {
    icon: MessageSquareText,
    className: 'border-destructive-border bg-destructive-soft text-destructive-foreground',
  },
} as const;

const linkClass = 'shrink-0 font-semibold whitespace-nowrap underline underline-offset-2';

export function SubscriptionBar({
  subscription,
  sms,
  isOwner,
  canAct,
}: {
  subscription: SubscriptionSummary;
  sms: BillingSmsUsage | null;
  isOwner: boolean;
  canAct: boolean;
}) {
  const [dismissed, setDismissed] = useState(() => ({
    trial: dismissedToday('trial'),
    sms: dismissedToday('sms'),
  }));
  const close = (bar: Dismissable) => {
    dismissForToday(bar);
    setDismissed((current) => ({ ...current, [bar]: true }));
  };

  // One bar at a time: the account's own state first, then the month's SMS.
  const account = barFor(subscription);
  if (account && !(account.closable && dismissed.trial)) {
    return (
      <BarFrame
        kind={account.kind}
        short={account.short}
        lead={account.lead}
        detail={account.detail}
        action={
          canAct && (
            <Link to={subscriptionPath} data-testid="subscription-bar-action" className={linkClass}>
              {ownerActionFor(subscription).label}
            </Link>
          )
        }
        onClose={account.closable ? () => close('trial') : undefined}
      />
    );
  }

  const smsBar =
    sms && subscription.access === 'full'
      ? smsBarFor(sms, {
          owner: isOwner,
          canAct,
          stop: stopOf(sms, subscription.planChosen),
        })
      : null;
  if (!smsBar || (smsBar.closable && dismissed.sms)) return null;
  return (
    <BarFrame
      kind={smsBar.kind}
      state={smsBar.state}
      short={smsBar.short}
      lead={smsBar.lead}
      detail={smsBar.detail}
      action={
        smsBar.link === 'raiseCap' ? (
          <Link
            to="/organization/subscription"
            search={{ raiseCap: true }}
            data-testid="subscription-bar-action"
            className="inline-flex h-8 shrink-0 items-center rounded-lg bg-primary px-3 font-semibold whitespace-nowrap text-primary-foreground hover:bg-primary/90"
          >
            Ridică limita
          </Link>
        ) : smsBar.link === 'usage' ? (
          <Link to={subscriptionPath} data-testid="subscription-bar-action" className={linkClass}>
            <span className="md:hidden">Vezi</span>
            <span className="hidden md:inline">Vezi consumul</span>
          </Link>
        ) : null
      }
      onClose={smsBar.closable ? () => close('sms') : undefined}
    />
  );
}

function BarFrame({
  kind,
  state,
  short,
  lead,
  detail,
  action,
  onClose,
}: {
  kind: keyof typeof tones;
  state?: string;
  short: string;
  lead: string;
  detail: string;
  action: ReactNode;
  onClose?: () => void;
}) {
  const tone = tones[kind];
  const Icon = tone.icon;
  return (
    <div
      role="status"
      data-testid="subscription-bar"
      data-kind={kind}
      data-state={state}
      className={cn(
        'flex min-h-11 items-center gap-3 border-b px-4 py-1.5 text-sm sm:px-8 lg:px-10',
        tone.className
      )}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      <p className="min-w-0 flex-1">
        <span className="font-semibold md:hidden">{short}</span>
        <span className="hidden font-semibold md:inline">{lead}</span>
        <span className="hidden md:inline"> {detail}</span>
      </p>
      {action}
      {onClose && (
        <button
          type="button"
          data-testid="subscription-bar-close"
          aria-label="Închide până mâine"
          onClick={onClose}
          className="-mr-2 grid size-9 shrink-0 cursor-pointer place-items-center rounded-md hover:bg-black/5"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      )}
    </div>
  );
}
