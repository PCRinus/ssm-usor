import { Button } from '@ssm-usor/ui/components/button';
import { SearchX } from 'lucide-react';

import { EmptyState } from '@/components/empty-state';

export function EmployeesNoMatch({
  title = 'Niciun angajat nu corespunde căutării',
  hint,
  testId,
  clearLabel = 'Șterge căutarea',
  clearTestId = `${testId}-clear-search`,
  onClear,
}: {
  title?: string;
  hint: string;
  testId: string;
  clearLabel?: string;
  clearTestId?: string;
  onClear: () => void;
}) {
  return (
    <EmptyState
      icon={SearchX}
      title={title}
      data-testid={testId}
      actions={
        <Button variant="outline" data-testid={clearTestId} onClick={onClear}>
          {clearLabel}
        </Button>
      }
    >
      {hint}
    </EmptyState>
  );
}
