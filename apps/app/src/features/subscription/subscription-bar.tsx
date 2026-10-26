import type { SubscriptionSummary } from '@ssm-usor/contracts';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Clock, Lock, TriangleAlert, X } from 'lucide-react';
import { useState } from 'react';

import { dateToIso } from '@/lib/dates';

import { barFor, contactEmail } from './subscription-copy';

const dismissedKey = 'ssm-usor.trial-bar-dismissed';

// Closing hides the bar for the rest of the day; it comes back tomorrow, and on the last day of
// the trial it cannot be closed at all.
function dismissedToday() {
  try {
    return localStorage.getItem(dismissedKey) === dateToIso(new Date());
  } catch {
    return false;
  }
}

function dismissForToday() {
  try {
    localStorage.setItem(dismissedKey, dateToIso(new Date()));
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
} as const;

export function SubscriptionBar({
  subscription,
  canAct,
}: {
  subscription: SubscriptionSummary;
  canAct: boolean;
}) {
  const [dismissed, setDismissed] = useState(dismissedToday);
  const bar = barFor(subscription);
  if (!bar || (bar.closable && dismissed)) return null;

  const tone = tones[bar.kind];
  const Icon = tone.icon;

  return (
    <div
      role="status"
      data-testid="subscription-bar"
      data-kind={bar.kind}
      className={cn(
        'flex min-h-11 items-center gap-3 border-b px-4 py-1.5 text-sm sm:px-8 lg:px-10',
        tone.className
      )}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      <p className="min-w-0 flex-1">
        <span className="font-semibold">{bar.lead}</span>
        <span className="hidden md:inline"> {bar.detail}</span>
      </p>
      {canAct && (
        <a
          href={`mailto:${contactEmail}`}
          className="shrink-0 font-semibold whitespace-nowrap underline underline-offset-2"
        >
          Scrie-ne
        </a>
      )}
      {bar.closable && (
        <button
          type="button"
          data-testid="subscription-bar-close"
          aria-label="Închide până mâine"
          onClick={() => {
            dismissForToday();
            setDismissed(true);
          }}
          className="-mr-2 grid size-9 shrink-0 cursor-pointer place-items-center rounded-md hover:bg-black/5"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      )}
    </div>
  );
}
