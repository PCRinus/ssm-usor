import type { TrainingStateFilter as TrainingStateFilterValue } from '@ssm-usor/contracts';

import { FilterChips } from '@/components/filter-chips';

const chips: { value: TrainingStateFilterValue | undefined; label: string }[] = [
  { value: undefined, label: 'Toate' },
  { value: 'current', label: 'La zi' },
  { value: 'due', label: 'Scadente' },
  { value: 'overdue', label: 'Depășite' },
  { value: 'untrained', label: 'Neinstruiți' },
];

export function TrainingStateFilter({
  value,
  onChange,
  testId,
}: {
  value: TrainingStateFilterValue | undefined;
  onChange: (value: TrainingStateFilterValue | undefined) => void;
  testId: string;
}) {
  return (
    <FilterChips
      label="Filtrează după starea instruirii"
      caption="Instruire:"
      chips={chips}
      value={value}
      onChange={onChange}
      testId={testId}
    />
  );
}
