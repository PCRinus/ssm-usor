import { cn } from '@ssm-usor/ui/lib/utils';
import { Link } from '@tanstack/react-router';
import { ChevronRight, type LucideIcon } from 'lucide-react';

import type { DashboardTarget } from './dashboard-links';

const badgeTones = {
  lime: 'bg-brand-lime text-foreground',
  ink: 'bg-muted text-foreground',
  red: 'bg-destructive-soft text-destructive',
} as const;

const surfaces = {
  tile: 'rounded-2xl border border-dashboard-tile-border bg-card px-3.5 py-3 sm:px-4 sm:py-3.5',
  row: '-mx-2.5 rounded-xl px-2.5 py-3 sm:py-3.5',
  bare: 'rounded-xl',
} as const;

const hovers = {
  tile: 'hover:border-dashboard-tile-hover-border hover:bg-dashboard-hover',
  row: 'hover:bg-dashboard-hover',
  bare: '',
} as const;

export const focusRing =
  'outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

export const numberClass =
  'text-2xl leading-none font-[650] tracking-[-0.03em] tabular-nums sm:text-[28px]';

export type DashboardItemProps = {
  icon: LucideIcon;
  tone: keyof typeof badgeTones;
  surface: keyof typeof surfaces;
  count?: number;
  label: string;
  detail?: string;
  alert?: boolean;
  target?: DashboardTarget;
  chevron?: boolean;
  testId?: string;
  className?: string;
};

export function DashboardItem({
  icon: Icon,
  tone,
  surface,
  count,
  label,
  detail,
  alert = false,
  target,
  chevron = true,
  testId,
  className,
}: DashboardItemProps) {
  const arrow = Boolean(target) && chevron;
  const content = (
    <>
      <span className={cn('grid size-10 place-items-center rounded-xl', badgeTones[tone])}>
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block leading-snug">
          {count !== undefined && (
            <>
              <span
                data-testid={testId && `${testId}-count`}
                className={cn(numberClass, 'mr-1', alert && 'text-destructive')}
              >
                {count}
              </span>{' '}
            </>
          )}
          <span className="text-[14.5px] font-semibold sm:text-[15px]">{label}</span>
        </span>
        {detail && (
          <>
            {' '}
            <span className="mt-[3px] block text-[12.5px] leading-snug text-muted-foreground sm:text-[13.5px]">
              {detail}
            </span>
          </>
        )}
      </span>
      {arrow && <ChevronRight className="size-4 text-dashboard-chevron" aria-hidden="true" />}
    </>
  );
  const classes = cn(
    'grid min-w-0 items-center gap-x-3 sm:gap-x-3.5',
    arrow ? 'grid-cols-[40px_minmax(0,1fr)_16px]' : 'grid-cols-[40px_minmax(0,1fr)]',
    surfaces[surface],
    className
  );
  if (!target) {
    return (
      <div data-testid={testId} className={classes}>
        {content}
      </div>
    );
  }
  return (
    <Link
      {...target}
      data-testid={testId}
      className={cn(
        classes,
        hovers[surface],
        focusRing,
        'transition-colors motion-reduce:transition-none'
      )}
    >
      {content}
    </Link>
  );
}
