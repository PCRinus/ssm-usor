import { cn } from '@ssm-usor/ui/lib/utils';
import type { ReactNode } from 'react';

import { replayMask } from '@/app/observability/replay-masking';
import { backGap } from '@/components/back-gap';
import { BackSlot } from '@/components/back-link';

// Measured on the header, not on the window: the sidebar takes a share of the window.
const actionsPlacement = {
  narrow: 'w-full @lg:w-auto @lg:shrink-0',
  wide: 'w-full @2xl:w-auto @2xl:shrink-0',
} as const;

export function RecordHeader({
  back,
  title,
  facts,
  actions,
  actionsWidth = 'narrow',
  personal = false,
}: {
  back?: ReactNode;
  title: string;
  personal?: boolean;
  facts: ReactNode;
  actions?: ReactNode;
  actionsWidth?: keyof typeof actionsPlacement;
}) {
  return (
    <header className="@container">
      <div className={cn('flex min-w-0 flex-wrap items-start gap-y-3', backGap)}>
        {back && <BackSlot line="text-xl">{back}</BackSlot>}
        <div className="min-w-0 flex-1">
          <h1
            className="text-xl font-semibold tracking-tight wrap-anywhere"
            {...(personal && replayMask)}
          >
            {title}
          </h1>
          <dl className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-sm">{facts}</dl>
        </div>
        {actions && (
          <div className={`flex flex-wrap gap-2 self-center ${actionsPlacement[actionsWidth]}`}>
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}

export function HeaderFact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 gap-1.5">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="truncate">{children}</dd>
    </div>
  );
}
