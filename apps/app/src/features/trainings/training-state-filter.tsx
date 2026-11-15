import type {
  EmployeeTrainingStateFilter,
  TrainingStateFilter as State,
} from '@ssm-usor/contracts';

import { FilterChips } from '@/components/filter-chips';

const chips: { value: EmployeeTrainingStateFilter | undefined; label: string }[] = [
  { value: undefined, label: 'Toate' },
  { value: 'current', label: 'La zi' },
  { value: 'due', label: 'Scadente' },
  { value: 'overdue', label: 'Depășite' },
  { value: 'untrained', label: 'Neinstruiți' },
];

// One client's list also filters to those the clients list counts as "de instruit".
const attentionChip = { value: 'attention', label: 'De instruit' } as const;

type Props<Value> = {
  value: Value | undefined;
  onChange: (value: Value | undefined) => void;
  testId: string;
};

// The chip only where the route takes the value: its onChange must accept "attention".
export function TrainingStateFilter(
  props: Props<EmployeeTrainingStateFilter> & { withAttention: true }
): React.JSX.Element;
export function TrainingStateFilter(
  props: Props<State> & { withAttention?: false }
): React.JSX.Element;
export function TrainingStateFilter({
  value,
  onChange,
  withAttention = false,
  testId,
}: (Props<EmployeeTrainingStateFilter> | Props<State>) & { withAttention?: boolean }) {
  return (
    <FilterChips
      label="Filtrează după starea instruirii"
      caption="Instruire:"
      chips={withAttention ? [...chips, attentionChip] : chips}
      value={value}
      onChange={onChange as Props<EmployeeTrainingStateFilter>['onChange']}
      testId={testId}
    />
  );
}
