import { useLingui } from '@lingui/react/macro';
import { trainingDomains } from '@ssm-usor/contracts';

import type { PortalClientEmployeesResponse } from '@/api/generated/api';
import { TestStateBadge } from '@/features/tests/test-state-badge';
import { TrainingStateBadge } from '@/features/training/training-state-badge';
import { useFormatDate } from '@/lib/format';
import { trainingDomainMessages } from '@/lib/labels';

type ClientEmployee = PortalClientEmployeesResponse['items'][number];

export function EmployeeTrainingStates({ employee }: { employee: ClientEmployee }) {
  const { t, i18n } = useLingui();
  const formatDate = useFormatDate();
  return (
    <span className="grid grid-cols-2 gap-3 sm:flex sm:gap-8">
      {trainingDomains.map((domain) => {
        const { state, dueOn } = employee.training[domain];
        const testState = employee.tests[domain].state;
        const due = dueOn && formatDate(dueOn);
        return (
          <span key={domain} className="grid content-start gap-1 text-sm">
            <span className="flex items-center gap-2">
              <span className="font-medium">{i18n._(trainingDomainMessages[domain])}</span>
              {state ? (
                <TrainingStateBadge state={state} testId={`employee-state-${domain}`} />
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </span>
            {due && (
              <span className="text-xs text-muted-foreground tabular-nums">
                {state === 'overdue' ? t`din ${due}` : t`până la ${due}`}
              </span>
            )}
            {testState && (
              <span className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{t`Test`}</span>
                <TestStateBadge state={testState} testId={`employee-test-state-${domain}`} />
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}
