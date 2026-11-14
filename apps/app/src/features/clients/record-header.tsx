import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import type { ReactNode } from 'react';

import { replayMask } from '@/app/observability/replay-masking';

// Measured on the header, not on the window: the sidebar takes a share of the window.
const actionsPlacement = {
  narrow: 'w-full @lg:w-auto @lg:shrink-0',
  wide: 'w-full @2xl:w-auto @2xl:shrink-0',
} as const;

export function RecordHeader({
  back,
  title,
  titleAside,
  facts,
  actions,
  actionsWidth = 'narrow',
  personal = false,
}: {
  back?: ReactNode;
  title: string;
  titleAside?: ReactNode;
  personal?: boolean;
  facts: ReactNode;
  actions?: ReactNode;
  actionsWidth?: keyof typeof actionsPlacement;
}) {
  return (
    <header className="@container">
      {/* h-7 is the title's line height, so the arrow stays on its first line while a long
          name wraps under itself. */}
      <div className="flex min-w-0 flex-wrap items-start gap-3">
        {back && <div className="flex h-7 shrink-0 items-center">{back}</div>}
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-1.5">
            <h1
              className="min-w-0 text-xl font-semibold tracking-tight wrap-anywhere"
              {...(personal && replayMask)}
            >
              {title}
            </h1>
            {titleAside && <div className="flex h-7 shrink-0 items-center">{titleAside}</div>}
          </div>
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

export function RecordHeaderPending({ back }: { back: ReactNode }) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <div className="flex h-7 shrink-0 items-center">{back}</div>
      <div className="grid min-w-0 flex-1 gap-1.5">
        <Skeleton className="h-7 w-72 max-w-full" />
        <Skeleton className="h-4 w-48 max-w-full" />
      </div>
    </div>
  );
}
