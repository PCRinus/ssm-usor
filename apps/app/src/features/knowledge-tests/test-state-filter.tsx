import type { TestStateFilter as TestStateFilterValue } from '@ssm-usor/contracts';

import { FilterChips } from '@/components/filter-chips';

const chips: { value: TestStateFilterValue | undefined; label: string }[] = [
  { value: undefined, label: 'Toate' },
  { value: 'passed', label: 'Promovate' },
  { value: 'pending', label: 'De susținut' },
  { value: 'annual_due', label: 'Anual scadent' },
  { value: 'none', label: 'Fără test' },
];

export function TestStateFilter({
  value,
  onChange,
  testId,
}: {
  value: TestStateFilterValue | undefined;
  onChange: (value: TestStateFilterValue | undefined) => void;
  testId: string;
}) {
  return (
    <FilterChips
      label="Filtrează după starea testării"
      caption="Testare:"
      chips={chips}
      value={value}
      onChange={onChange}
      testId={testId}
    />
  );
}
