import type { ClientTraining } from '@ssm-usor/contracts';
import { Link } from '@tanstack/react-router';
import { Check } from 'lucide-react';
import type { ReactNode } from 'react';

import { openedHere } from '@/app/opener';
import { CellBadge } from '@/components/data-table/cell-badge';
import { CellEmpty } from '@/components/data-table/cell-note';
import { roCount } from '@/features/employees/employee-format';

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
  const link = (label: ReactNode, className?: string) => (
    <Link
      to="/clienti/$clientId/angajati"
      params={{ clientId: client.id }}
      search={search}
      state={openedHere}
      data-testid="clients-training"
      data-state={state}
      className={className}
    >
      {label}
    </Link>
  );
  if (state === 'current') {
    return link(
      <>
        <Check className="size-4 text-muted-foreground" aria-hidden="true" />
        La zi
      </>,
      'inline-flex items-center gap-1.5 hover:underline'
    );
  }
  return (
    <CellBadge
      asChild
      tone={state === 'attention' ? 'destructive' : 'warning'}
      className="tabular-nums"
    >
      {link(
        state === 'attention'
          ? `${training.attentionCount} de instruit`
          : roCount(training.dueCount, 'scadentă', 'scadente')
      )}
    </CellBadge>
  );
}
