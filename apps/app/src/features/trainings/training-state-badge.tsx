import {
  type EmployeeTraining,
  type TrainingDomain,
  type TrainingState,
  trainingStateLabels,
} from '@ssm-usor/contracts';
import { Badge } from '@ssm-usor/ui/components/badge';

import { formatDate } from '@/features/employees/employee-format';

const stateBadges: Record<
  TrainingState,
  { variant: 'outline' | 'destructive'; className?: string }
> = {
  untrained: { variant: 'outline' },
  current: {
    variant: 'outline',
    className: 'border-success-border bg-success text-success-foreground',
  },
  due: {
    variant: 'outline',
    className: 'border-warning-border bg-warning text-warning-foreground',
  },
  overdue: { variant: 'destructive' },
};

export function TrainingStateBadge({ state, testId }: { state: TrainingState; testId?: string }) {
  const badge = stateBadges[state];
  return (
    <Badge
      variant={badge.variant}
      className={badge.className}
      data-testid={testId}
      data-state={state}
    >
      {trainingStateLabels[state]}
    </Badge>
  );
}

export function TrainingStateCell({
  training,
  domain,
}: {
  training: EmployeeTraining;
  domain: TrainingDomain;
}) {
  const { state, dueOn } = training[domain];
  if (!state) return <span className="text-muted-foreground">—</span>;
  return (
    <>
      <TrainingStateBadge state={state} testId={`training-status-${domain}`} />
      {dueOn && (
        <span
          className="mt-0.5 block text-xs text-muted-foreground tabular-nums"
          data-testid={`training-due-${domain}`}
        >
          {state === 'overdue' ? 'din' : 'până la'} {formatDate(dueOn)}
        </span>
      )}
    </>
  );
}
