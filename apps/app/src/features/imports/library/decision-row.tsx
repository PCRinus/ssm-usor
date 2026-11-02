import { Button } from '@ssm-usor/ui/components/button';
import { Input } from '@ssm-usor/ui/components/input';
import { Label } from '@ssm-usor/ui/components/label';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Check, Pencil, TriangleAlert } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';

export type Tone = 'done' | 'todo' | 'info' | 'warning';

const toneLabels: Record<Tone, string> = {
  done: 'Gata',
  todo: 'De ales',
  info: 'De știut',
  warning: 'Atenționare',
};

export function StatusDot({ tone }: { tone: Tone }) {
  return (
    <span
      className={cn(
        'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full sm:mt-0',
        tone === 'done' && 'border border-success-border bg-success text-success-foreground',
        tone === 'todo' && 'border border-warning-border bg-warning',
        tone === 'info' && 'border border-info-border bg-info',
        tone === 'warning' && 'text-warning-foreground'
      )}
    >
      <span className="sr-only">{toneLabels[tone]}</span>
      {tone === 'done' && <Check className="size-3" strokeWidth={3} aria-hidden="true" />}
      {tone === 'todo' && <span className="size-2 rounded-full bg-chart-3" aria-hidden="true" />}
      {tone === 'info' && <span className="h-0.5 w-2 rounded-full bg-ring" aria-hidden="true" />}
      {tone === 'warning' && <TriangleAlert className="size-4" aria-hidden="true" />}
    </span>
  );
}

export function DecisionRow({
  tone,
  label,
  actions,
  below,
  testId,
  children,
}: {
  tone: Tone;
  label: ReactNode;
  actions?: ReactNode;
  below?: ReactNode;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <div
      data-testid={testId}
      data-tone={tone}
      className={cn(
        'grid grid-cols-[1.25rem_minmax(0,1fr)] items-start gap-x-3 gap-y-1 border-t border-border/70 px-4 py-3 sm:min-h-14 sm:grid-cols-[1.25rem_10.5rem_minmax(0,1fr)_auto] sm:items-center sm:gap-x-4 sm:px-5',
        tone === 'todo' && 'bg-warning/40'
      )}
    >
      <StatusDot tone={tone} />
      <span className="text-sm font-medium">{label}</span>
      <div className="col-start-2 grid min-w-0 gap-1 text-sm sm:col-start-auto">{children}</div>
      {actions && (
        <div className="col-start-2 mt-2 grid gap-2 sm:col-start-auto sm:mt-0 sm:flex sm:flex-wrap sm:justify-end">
          {actions}
        </div>
      )}
      {below && <div className="col-start-2 mt-2 min-w-0 sm:col-span-3">{below}</div>}
    </div>
  );
}

export type SegmentOption<T extends string> = { value: T; label: string };

export function Segmented<T extends string>({
  name,
  label,
  options,
  value,
  disabled,
  testIdPrefix,
  stackOnPhone = false,
  onPick,
}: {
  name: string;
  label: string;
  options: readonly SegmentOption<T>[];
  value: T | null;
  disabled: boolean;
  testIdPrefix: string;
  // Three long labels do not fit side by side at 360 px.
  stackOnPhone?: boolean;
  onPick: (value: T) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        'grid rounded-lg border border-input bg-secondary p-0.5 sm:inline-flex',
        stackOnPhone ? 'grid-cols-1' : 'grid-cols-2'
      )}
    >
      {options.map((option) => (
        <label
          key={option.value}
          className="relative inline-flex h-[30px] cursor-pointer items-center justify-center rounded-md px-3.5 text-sm font-medium whitespace-nowrap text-muted-foreground has-checked:bg-card has-checked:font-semibold has-checked:text-foreground has-checked:shadow-xs has-focus-visible:ring-[3px] has-focus-visible:ring-ring/50 has-disabled:cursor-not-allowed"
        >
          <input
            type="radio"
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

export function PendingNote({ line, testId }: { line: string | null; testId: string }) {
  if (line === null) {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-success-foreground"
        data-testid={testId}
      >
        <Check className="size-4" aria-hidden="true" />
        Gata de confirmat
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-2 text-[13px] font-semibold text-warning-foreground"
      data-testid={testId}
    >
      <span
        className="flex size-4 items-center justify-center rounded-full border border-warning-border bg-warning"
        aria-hidden="true"
      >
        <span className="size-1.5 rounded-full bg-chart-3" />
      </span>
      {line}
    </span>
  );
}

export function RenameRow({
  label,
  value,
  written,
  error,
  editable,
  validate,
  testIdPrefix,
  field,
  onCommit,
}: {
  label: string;
  value: string;
  // What the document says, shown under a value that differs from it.
  written: string | null;
  // A refusal from the server, kept until the value changes.
  error: string | null;
  editable: boolean;
  validate: (value: string) => string | null;
  testIdPrefix: string;
  field: 'title' | 'name';
  onCommit: (value: string) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(value);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const shownError = draftError ?? error;
  const open = editable && (renaming || Boolean(shownError));
  if (!open && draft !== value) setDraft(value);

  function commit() {
    const problem = validate(draft);
    setDraftError(problem);
    if (problem) return;
    setRenaming(false);
    const next = draft.trim();
    if (next !== value) onCommit(next);
  }

  function cancel() {
    setDraft(value);
    setDraftError(null);
    setRenaming(false);
  }

  return (
    <DecisionRow
      tone={editable && shownError ? 'todo' : 'done'}
      label={open ? <Label htmlFor={`${id}-input`}>{label}</Label> : label}
      actions={
        editable &&
        (open ? (
          <>
            <Button type="button" variant="outline" onClick={cancel}>
              Renunță
            </Button>
            <Button type="button" data-testid={`${testIdPrefix}-${field}-save`} onClick={commit}>
              {field === 'title' ? 'Salvează titlul' : 'Salvează numele'}
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="outline"
            data-testid={`${testIdPrefix}-rename`}
            onClick={() => {
              setDraft(value);
              setRenaming(true);
            }}
          >
            <Pencil aria-hidden="true" />
            Redenumește
          </Button>
        ))
      }
    >
      {open ? (
        <Input
          id={`${id}-input`}
          data-testid={`${testIdPrefix}-${field}-input`}
          value={draft}
          autoFocus={renaming}
          aria-invalid={Boolean(shownError)}
          aria-describedby={shownError ? `${id}-error` : `${id}-written`}
          onChange={(event) => {
            setDraft(event.target.value);
            setDraftError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commit();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              cancel();
            }
          }}
        />
      ) : (
        <span className="wrap-anywhere" data-testid={`${testIdPrefix}-library-${field}`}>
          {value}
        </span>
      )}
      {shownError ? (
        <span
          id={`${id}-error`}
          className="text-[13px] text-destructive"
          data-testid={`${testIdPrefix}-${field}-error`}
        >
          {shownError}
        </span>
      ) : (
        written !== null &&
        written !== value && (
          <span
            id={`${id}-written`}
            className="truncate text-[13px] text-muted-foreground"
            title={written}
          >
            Din document: {written}
          </span>
        )
      )}
    </DecisionRow>
  );
}
