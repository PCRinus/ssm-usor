import {
  type EmployeeTraining,
  type TrainingDomain,
  trainingDomainLabels,
  trainingDomains,
  type TrainingState,
  trainingStateLabels,
} from '@ssm-usor/contracts';
import { Badge } from '@ssm-usor/ui/components/badge';
import { cn } from '@ssm-usor/ui/lib/utils';

import { formatDate } from '@/features/employees/employee-format';

const stateBadges: Record<
  TrainingState,
  { variant: 'outline' | 'secondary' | 'destructive'; className?: string }
> = {
  untrained: { variant: 'outline' },
  current: { variant: 'secondary', className: 'text-muted-foreground' },
  due: {
    variant: 'outline',
    className: 'border-warning-border bg-warning text-warning-foreground',
  },
  overdue: { variant: 'destructive' },
};

export function TrainingStateBadge({
  state,
  label = trainingStateLabels[state],
  className,
  testId,
  title,
  hidden,
}: {
  state: TrainingState;
  label?: string;
  className?: string;
  testId?: string;
  title?: string;
  hidden?: boolean;
}) {
  const badge = stateBadges[state];
  return (
    <Badge
      variant={badge.variant}
      className={cn(badge.className, className)}
      data-testid={testId}
      data-state={state}
      title={title}
      aria-hidden={hidden}
    >
      {label}
    </Badge>
  );
}

function statusSummary(domain: TrainingDomain, training: EmployeeTraining) {
  const { state, dueOn } = training[domain];
  if (!state) return '';
  const due = dueOn ? `, termen ${formatDate(dueOn)}` : '';
  return `${trainingDomainLabels[domain]}: ${trainingStateLabels[state].toLowerCase()}${due}`;
}

// The badge says the state by colour only, which a screen reader cannot read.
export function TrainingStatusBadges({ training }: { training: EmployeeTraining }) {
  const shown = trainingDomains.filter((domain) => training[domain].state !== null);
  if (shown.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {shown.map((domain) => {
        const summary = statusSummary(domain, training);
        return (
          <span key={domain} className="contents">
            <TrainingStateBadge
              state={training[domain].state!}
              label={trainingDomainLabels[domain]}
              testId={`training-status-${domain}`}
              title={summary}
              className="px-1.5"
              hidden
            />
            <span className="sr-only">{summary}</span>
          </span>
        );
      })}
    </span>
  );
}
