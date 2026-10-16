import { Button } from '@ssm-usor/ui/components/button';
import { SearchX } from 'lucide-react';

export function EmployeesNoMatch({
  hint,
  testId,
  onClear,
}: {
  hint: string;
  testId: string;
  onClear: () => void;
}) {
  return (
    <>
      <SearchX className="mx-auto mb-4 size-8 text-muted-foreground" aria-hidden="true" />
      <h3 className="text-base font-medium">Niciun angajat nu corespunde căutării</h3>
      <p
        data-testid={testId}
        className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground"
      >
        {hint}
      </p>
      <Button
        variant="outline"
        className="mt-5"
        data-testid={`${testId}-clear-search`}
        onClick={onClear}
      >
        Șterge căutarea
      </Button>
    </>
  );
}
