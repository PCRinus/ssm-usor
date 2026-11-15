import type { ClientTraining, EmployeeTrainingStateFilter } from '@ssm-usor/contracts';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Link } from '@tanstack/react-router';
import { Check, CircleAlert, Clock } from 'lucide-react';

import { openedHere } from '@/app/opener';
import { roCount } from '@/features/employees/employee-format';

import type { ClientRow } from './client-columns';

function trainingLinkState(training: ClientTraining): EmployeeTrainingStateFilter {
  if (training.attentionCount > 0) return 'attention';
  return training.dueCount > 0 ? 'due' : 'current';
}

export function TrainingCell({ client }: { client: ClientRow }) {
  const training = client.training;
  if (!training || training.employeeCount === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  const state = trainingLinkState(training);
  const [Icon, label, tone, iconTone] =
    training.attentionCount > 0
      ? [
          CircleAlert,
          `${training.attentionCount} de instruit`,
          'font-medium text-destructive-foreground',
          'text-destructive',
        ]
      : training.dueCount > 0
        ? [
            Clock,
            roCount(training.dueCount, 'scadentă', 'scadente'),
            'font-medium text-warning-foreground',
            'text-chart-3',
          ]
        : [Check, 'La zi', 'text-muted-foreground', 'text-muted-foreground'];
  return (
    <Link
      to="/clienti/$clientId/angajati"
      params={{ clientId: client.id }}
      search={{ trainingState: state }}
      state={openedHere}
      data-testid="clients-training"
      data-state={state}
      className={cn('inline-flex items-center gap-1.5 tabular-nums hover:underline', tone)}
    >
      <Icon className={cn('size-4', iconTone)} aria-hidden="true" />
      {label}
    </Link>
  );
}
