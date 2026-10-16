import type { TrainingStateFilter as TrainingStateFilterValue } from '@ssm-usor/contracts';
import { cn } from '@ssm-usor/ui/lib/utils';

const chips: { value: TrainingStateFilterValue | undefined; label: string }[] = [
  { value: undefined, label: 'Toate' },
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
    <div
      role="group"
      aria-label="Filtrează după starea instruirii"
      className="flex flex-wrap items-center gap-1.5"
      data-testid={testId}
    >
      <span className="mr-1 text-xs text-muted-foreground">Instruire:</span>
      {chips.map((chip) => {
        const active = chip.value === value;
        return (
          <button
            key={chip.label}
            type="button"
            aria-pressed={active}
            data-testid={`${testId}-${chip.value ?? 'all'}`}
            onClick={() => onChange(chip.value)}
            className={cn(
              'rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
              active
                ? 'border-primary bg-primary/10 text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}
