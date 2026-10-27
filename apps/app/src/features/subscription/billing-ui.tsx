import { cn } from '@ssm-usor/ui/lib/utils';
import type { ComponentProps, ReactNode } from 'react';

import { sealLooks } from './seal-looks';
import type { SealKind } from './subscription-copy';

export function BillingCard({
  title,
  aside,
  className,
  children,
  ...props
}: Omit<ComponentProps<'section'>, 'title'> & { title?: ReactNode; aside?: ReactNode }) {
  return (
    <section
      className={cn(
        'flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-4 shadow-sm sm:p-6',
        className
      )}
      {...props}
    >
      {(title || aside) && (
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          {title && <h2 className="text-base font-semibold">{title}</h2>}
          {aside && <span className="text-[13px] text-muted-foreground">{aside}</span>}
        </div>
      )}
      {children}
    </section>
  );
}

export function SealChip({ kind, label }: { kind: SealKind; label: string }) {
  const look = sealLooks[kind];
  const Icon = look.icon;
  return (
    <span
      data-testid="plan-seal"
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold whitespace-nowrap',
        look.className
      )}
    >
      <Icon aria-hidden="true" className={cn('size-3.5', look.iconClassName)} />
      {label}
    </span>
  );
}

export function StateChip({ tone, children }: { tone: 'plain' | 'warning'; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex h-7 items-center rounded-full border px-2.5 text-[13px] font-medium',
        tone === 'warning'
          ? 'border-warning-border bg-warning text-warning-foreground'
          : 'border-border bg-muted text-foreground'
      )}
    >
      {children}
    </span>
  );
}

export interface AmountRow {
  label: string;
  value: string;
  strong?: boolean;
}

export function AmountRows({ rows, className }: { rows: AmountRow[]; className?: string }) {
  return (
    <dl className={cn('grid gap-2 text-sm', className)}>
      {rows.map((row) => (
        <div
          key={row.label}
          className={cn(
            'flex justify-between gap-4',
            row.strong ? 'border-t pt-2 font-semibold' : 'text-muted-foreground'
          )}
        >
          <dt className="min-w-0">{row.label}</dt>
          <dd className="whitespace-nowrap tabular-nums">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function UsageBar({
  used,
  limit,
  ticks = [],
  label,
}: {
  used: number;
  limit: number;
  // Where an included amount or a pack ends, as fractions of the limit.
  ticks?: number[];
  label: string;
}) {
  const share = limit > 0 ? Math.min(1, used / limit) : 1;
  const over = used > limit;
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={limit}
      aria-valuenow={Math.min(used, limit)}
      className="relative h-2.5 overflow-hidden rounded-full bg-muted"
    >
      <div
        className={cn(
          'absolute inset-y-0 left-0 rounded-full',
          over ? 'bg-chart-3' : share >= 0.85 ? 'bg-warning-border' : 'bg-ring'
        )}
        style={{ width: `${share * 100}%` }}
      />
      {ticks.map((tick) => (
        <span
          key={tick}
          aria-hidden="true"
          className="absolute inset-y-0 w-0.5 bg-card"
          style={{ left: `calc(${tick * 100}% - 1px)` }}
        />
      ))}
    </div>
  );
}
