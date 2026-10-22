import { cn } from '@ssm-usor/ui/lib/utils';

export function FilterChips<T extends string>({
  label,
  caption,
  chips,
  value,
  onChange,
  testId,
}: {
  label: string;
  caption: string;
  chips: readonly { value: T | undefined; label: string }[];
  value: T | undefined;
  onChange: (value: T | undefined) => void;
  testId: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex flex-wrap items-center gap-1.5"
      data-testid={testId}
    >
      <span className="mr-1 text-xs text-muted-foreground">{caption}</span>
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
