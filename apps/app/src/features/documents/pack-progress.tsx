import { cn } from '@ssm-usor/ui/lib/utils';

import {
  legendStatuses,
  packBarLabel,
  packTotalLabel,
  sectionCaption,
  statusNoun,
  statusOrder,
} from './pack-labels';
import type { Pack, PackSection, StatusCounts } from './pack-status';
import { statusTone } from './pack-styles';

export function PackBar({
  counts,
  size = 'full',
  className,
}: {
  counts: StatusCounts;
  size?: 'full' | 'mini';
  className?: string;
}) {
  const shown = statusOrder.filter((status) => counts[status] > 0);
  return (
    <span
      data-testid={size === 'full' ? 'pack-bar' : 'pack-mini-bar'}
      {...(size === 'full'
        ? { role: 'img', 'aria-label': packBarLabel(counts) }
        : { 'aria-hidden': true })}
      className={cn(
        'flex w-full gap-0.5 overflow-hidden rounded-full',
        size === 'full' ? 'h-2.5' : 'h-1',
        shown.length === 0 && statusTone.missing,
        className
      )}
    >
      {shown.map((status) => (
        <span
          key={status}
          data-testid="pack-bar-segment"
          data-status={status}
          className={cn('basis-0', statusTone[status])}
          style={{ flexGrow: counts[status] }}
        />
      ))}
    </span>
  );
}

export function PackTotal({ pack, className }: { pack: Pack; className?: string }) {
  return (
    <span data-testid="pack-total" className={cn('text-sm text-muted-foreground', className)}>
      {packTotalLabel(pack)}
    </span>
  );
}

export function PackLegend({ pack }: { pack: Pack }) {
  const { counts } = pack;
  return (
    <div
      data-testid="pack-legend"
      className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[0.8125rem]"
    >
      {legendStatuses(counts).map((status) => (
        <span
          key={status}
          data-testid="pack-legend-item"
          data-status={status}
          className="inline-flex items-center gap-2"
        >
          <span
            aria-hidden="true"
            className={cn(
              'size-2.5 rounded-[3px]',
              statusTone[status],
              status === 'missing' && 'border border-input'
            )}
          />
          <span>
            <b className="text-[0.9375rem] font-semibold tracking-tight tabular-nums">
              {counts[status]}
            </b>{' '}
            {statusNoun(status, counts[status])}
          </span>
        </span>
      ))}
      <PackTotal pack={pack} className="ml-auto text-[0.8125rem]" />
    </div>
  );
}

export function SectionCaption({
  section,
  className,
}: {
  section: PackSection;
  className?: string;
}) {
  return (
    <span
      data-testid="pack-section-caption"
      className={cn('flex flex-wrap gap-x-2 text-xs text-muted-foreground', className)}
    >
      {sectionCaption(section).map((part) => (
        <span
          key={part.text}
          className={cn(part.tone === 'warning' && 'font-medium text-warning-foreground')}
        >
          {part.text}
        </span>
      ))}
    </span>
  );
}
