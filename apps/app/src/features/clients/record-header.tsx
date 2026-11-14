import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { replayMask } from '@/app/observability/replay-masking';

// Measured on the header, not on the window: the sidebar takes a share of the window.
const actionsPlacement = {
  narrow: 'w-full @lg:w-auto @lg:shrink-0',
  wide: 'w-full @2xl:w-auto @2xl:shrink-0',
} as const;

export function RecordHeader({
  back,
  icon: Icon,
  title,
  facts,
  actions,
  actionsWidth = 'narrow',
  personal = false,
}: {
  back?: ReactNode;
  icon: LucideIcon;
  title: string;
  personal?: boolean;
  facts: ReactNode;
  actions?: ReactNode;
  actionsWidth?: keyof typeof actionsPlacement;
}) {
  return (
    <header className="@container">
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        {back && <div className="-mr-1 -ml-3 flex shrink-0 sm:-ml-2">{back}</div>}
        <div
          className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"
          aria-hidden="true"
        >
          <Icon className="size-4" />
        </div>
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
          <div className={`flex flex-wrap gap-2 ${actionsPlacement[actionsWidth]}`}>{actions}</div>
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
