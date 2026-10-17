import { useLingui } from '@lingui/react/macro';
import type { TrainingState } from '@ssm-usor/contracts';
import { Badge } from '@ssm-usor/ui/components/badge';
import { cn } from '@ssm-usor/ui/lib/utils';

import { trainingStateMessages } from '@/lib/labels';

const stateClasses: Record<TrainingState, string> = {
  untrained: 'border-border bg-card text-muted-foreground',
  current: 'border-success-border bg-success text-success-foreground',
  due: 'border-warning-border bg-warning text-warning-foreground',
  overdue: 'border-destructive-border bg-destructive-soft text-destructive-foreground',
};

export function TrainingStateBadge({ state, testId }: { state: TrainingState; testId?: string }) {
  const { i18n } = useLingui();
  return (
    <Badge
      variant="outline"
      className={cn('px-2.5 font-semibold', stateClasses[state])}
      data-testid={testId}
      data-state={state}
    >
      {i18n._(trainingStateMessages[state])}
    </Badge>
  );
}
