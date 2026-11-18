import { type ClientTraining, countOf } from '@ssm-usor/contracts';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Link } from '@tanstack/react-router';
import { Check, CircleAlert, Clock } from 'lucide-react';

import { openedHere } from '@/app/opener';
import { CellEmpty } from '@/components/data-table/cell-note';

import type { ClientRow } from './client-columns';

// The cell counts either domain, as the workers list's "De instruit" and "Scadentă" needs do;
// "La zi" is current in both.
function trainingLink(training: ClientTraining) {
  if (training.attentionCount > 0) {
    return { state: 'attention', search: { attention: ['toTrain' as const] } } as const;
  }
  if (training.dueCount > 0) {
    return { state: 'due', search: { attention: ['trainingDue' as const] } } as const;
  }
  return {
    state: 'current',
    search: { ssmTraining: ['current' as const], suTraining: ['current' as const] },
  } as const;
}

export function TrainingCell({ client }: { client: ClientRow }) {
  const training = client.training;
  if (!training || training.employeeCount === 0) {
    return <CellEmpty />;
  }
  const { state, search } = trainingLink(training);
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
            countOf(training.dueCount, 'scadentă', 'scadente'),
            'font-medium text-warning-foreground',
            'text-chart-3',
          ]
        : [Check, 'La zi', '', 'text-muted-foreground'];
  return (
    <Link
      to="/clienti/$clientId/angajati"
      params={{ clientId: client.id }}
      search={search}
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
