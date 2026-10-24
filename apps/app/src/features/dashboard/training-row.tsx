import type {
  DashboardTrainingCounts,
  TrainingDomain,
  TrainingStateFilter,
} from '@ssm-usor/contracts';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Link } from '@tanstack/react-router';
import { Flame, GraduationCap } from 'lucide-react';

import { countOf, nounFor } from './dashboard-format';
import { DashboardItem, focusRing } from './dashboard-item';
import { dashboardLinks } from './dashboard-links';

const states: {
  state: TrainingStateFilter;
  short: string;
  long: string;
  colour: string;
}[] = [
  { state: 'overdue', short: 'depășite', long: 'depășite', colour: 'bg-destructive' },
  {
    state: 'due',
    short: 'scadente',
    long: 'scadente în 30 de zile',
    colour: 'bg-warning-border',
  },
  {
    state: 'untrained',
    short: 'neinstruiți',
    long: 'fără instruire la angajare',
    colour: 'bg-dashboard-untrained',
  },
  { state: 'current', short: 'la zi', long: 'la zi', colour: 'bg-border' },
];

const domains = {
  ssm: { icon: GraduationCap, name: 'SSM' },
  psi: { icon: Flame, name: 'PSI' },
} as const;

export function TrainingRow({
  domain,
  counts,
}: {
  domain: TrainingDomain;
  counts: DashboardTrainingCounts;
}) {
  const { icon, name } = domains[domain];
  const parts = states.map((part) => ({ ...part, count: counts[part.state] }));
  return (
    <div
      data-testid={`dashboard-trainings-${domain}`}
      className="grid gap-3 py-3.5 @min-[640px]:grid-cols-[minmax(0,320px)_minmax(0,1fr)] @min-[640px]:items-center @min-[640px]:gap-8 @min-[640px]:py-4"
    >
      <DashboardItem
        icon={icon}
        tone="ink"
        surface="bare"
        count={counts.overdue}
        alert={counts.overdue > 0}
        label={nounFor(counts.overdue, `instruire ${name} depășită`, `instruiri ${name} depășite`)}
        target={dashboardLinks.trainingState('overdue', domain)}
        chevron={false}
        testId={`dashboard-trainings-${domain}-overdue`}
      />
      <div className="min-w-0">
        <div
          role="img"
          aria-label={`Instruiri ${name}, ${countOf(counts.total, 'angajat', 'angajați')}: ${parts
            .map((part) => `${part.count} ${part.short}`)
            .join(', ')}`}
          className="flex h-3.5 gap-0.5 overflow-hidden rounded-[5px] bg-muted"
        >
          {parts
            .filter((part) => part.count > 0)
            .map((part) => (
              <span
                key={part.state}
                className={cn('min-w-1', part.colour)}
                style={{ flex: `${part.count} 1 0` }}
              />
            ))}
        </div>
        <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 @min-[640px]:mt-2.5 @min-[640px]:flex @min-[640px]:flex-wrap @min-[640px]:gap-x-[18px] @min-[640px]:gap-y-1">
          {parts.map((part) => (
            <li key={part.state}>
              <Link
                {...dashboardLinks.trainingState(part.state, domain)}
                title={`${part.long}: ${part.count}`}
                data-testid={`dashboard-trainings-${domain}-chip-${part.state}`}
                className={cn(
                  'inline-flex min-h-8 items-center gap-[7px] rounded-md text-[12.5px] text-dashboard-quiet underline-offset-[3px] hover:text-foreground hover:underline @min-[640px]:min-h-0 @min-[640px]:py-0.5 @min-[640px]:text-[13.5px]',
                  focusRing
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn('size-[9px] shrink-0 rounded-[3px]', part.colour)}
                />
                <span>
                  <b className="font-semibold text-foreground tabular-nums">{part.count}</b>{' '}
                  {part.short}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
