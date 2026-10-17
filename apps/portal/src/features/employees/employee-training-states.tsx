import { trainingDomainLabels, trainingDomains } from '@ssm-usor/contracts';

import type { PortalClientEmployeesResponse } from '@/api/generated/api';
import { TrainingStateBadge } from '@/features/training/training-state-badge';
import { formatDate } from '@/lib/format';

type ClientEmployee = PortalClientEmployeesResponse['items'][number];

export function EmployeeTrainingStates({ employee }: { employee: ClientEmployee }) {
  return (
    <span className="grid grid-cols-2 gap-2">
      {trainingDomains.map((domain) => {
        const { state, dueOn } = employee.training[domain];
        return (
          <span key={domain} className="grid gap-1 text-sm">
            <span className="flex items-center gap-1.5">
              <span className="font-medium">{trainingDomainLabels[domain]}</span>
              {state ? (
                <TrainingStateBadge state={state} testId={`employee-state-${domain}`} />
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </span>
            {dueOn && (
              <span className="text-xs text-muted-foreground tabular-nums">
                {state === 'overdue' ? 'din' : 'până la'} {formatDate(dueOn)}
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}
