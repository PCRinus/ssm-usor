import { type TrainingState, trainingStateLabels } from '@ssm-usor/contracts';
import { Badge } from '@ssm-usor/ui/components/badge';

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
