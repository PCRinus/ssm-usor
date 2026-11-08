import { cn } from '@ssm-usor/ui/lib/utils';

export type SegmentOption<T extends string> = {
  value: T;
  label: string;
  // A value read from elsewhere that the list does not offer: shown picked, and wrong.
  invalid?: boolean;
};

export function Segmented<T extends string>({
  id,
  name,
  label,
  options,
  value,
  disabled,
  testIdPrefix,
  phone = 'two-columns',
  invalid = false,
  describedBy,
  onPick,
}: {
  // Given to the picked option, else the first, so a label or a focus request can reach it.
  id?: string;
  name: string;
  label: string;
  options: readonly SegmentOption<T>[];
  value: T | null;
  disabled: boolean;
  testIdPrefix: string;
  // Three long labels do not fit side by side at 360 px; short numbers share one row.
  phone?: 'two-columns' | 'stacked' | 'one-row';
  invalid?: boolean;
  describedBy?: string;
  onPick: (value: T) => void;
}) {
  const picked = options.some((option) => option.value === value) ? value : null;
  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      className={cn(
        'grid rounded-lg border border-input bg-secondary p-0.5 sm:inline-flex sm:justify-self-start',
        phone === 'stacked' && 'grid-cols-1',
        phone === 'two-columns' && 'grid-cols-2',
        phone === 'one-row' && 'auto-cols-fr grid-flow-col',
        invalid && 'border-destructive ring-[3px] ring-destructive/20'
      )}
    >
      {options.map((option, index) => (
        <label
          key={option.value}
          className={cn(
            'relative inline-flex h-[30px] cursor-pointer items-center justify-center rounded-md px-3.5 text-sm font-medium whitespace-nowrap text-muted-foreground tabular-nums has-checked:bg-card has-checked:font-semibold has-checked:text-foreground has-checked:shadow-xs has-focus-visible:ring-[3px] has-focus-visible:ring-ring/50 has-disabled:cursor-not-allowed',
            option.invalid && 'has-checked:text-destructive'
          )}
        >
          <input
            type="radio"
            id={(picked === null ? index === 0 : option.value === picked) ? id : undefined}
            name={name}
            value={option.value}
            data-testid={`${testIdPrefix}-${option.value}`}
            className="absolute inset-0 m-0 size-full cursor-pointer appearance-none opacity-0 disabled:cursor-not-allowed"
            disabled={disabled}
            checked={value === option.value}
            onChange={() => onPick(option.value)}
            // A checked radio fires no change, and picking the proposed choice is what clears the
            // row's question.
            onClick={() => onPick(option.value)}
          />
          {option.label}
        </label>
      ))}
    </div>
  );
}
