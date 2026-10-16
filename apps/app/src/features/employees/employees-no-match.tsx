import { Button } from '@ssm-usor/ui/components/button';
import { SearchX } from 'lucide-react';

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
    <>
      <SearchX className="mx-auto mb-4 size-8 text-muted-foreground" aria-hidden="true" />
      <h3 className="text-base font-medium">{title}</h3>
      <p
        data-testid={testId}
        className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground"
      >
        {hint}
      </p>
      <Button variant="outline" className="mt-5" data-testid={clearTestId} onClick={onClear}>
        {clearLabel}
      </Button>
    </>
  );
}
