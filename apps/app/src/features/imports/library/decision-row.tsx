import { Button } from '@ssm-usor/ui/components/button';
import { Input } from '@ssm-usor/ui/components/input';
import { Label } from '@ssm-usor/ui/components/label';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Check, Pencil, SpellCheck, TriangleAlert } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';

import { rowTones } from './row-tones';

export type Tone = 'done' | 'todo' | 'optional' | 'info' | 'warning' | 'spelling' | 'editing';

const toneLabels: Record<Tone, string> = {
  done: 'Gata',
  todo: 'De ales',
  optional: 'Opțional',
  info: 'De știut',
  warning: 'Atenționare',
  spelling: 'Scriere corectată',
  editing: 'Schimbi acum',
};

export function StatusDot({ tone, className }: { tone: Tone; className?: string }) {
  return (
    <span
      className={cn(
        'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full sm:mt-0',
        className,
        tone === 'done' && 'border border-success-border bg-success text-success-foreground',
        tone === 'todo' && 'border border-warning-border bg-warning',
        tone === 'info' && 'border border-info-border bg-info',
        tone === 'optional' && 'border border-border bg-secondary text-muted-foreground',
        tone === 'warning' && 'text-warning-foreground',
        tone === 'spelling' && 'border border-info-border bg-info text-info-foreground',
        tone === 'editing' && 'bg-primary text-primary-foreground'
      )}
    >
      <span className="sr-only">{toneLabels[tone]}</span>
      {tone === 'done' && <Check className="size-3" strokeWidth={3} aria-hidden="true" />}
      {tone === 'todo' && <span className="size-2 rounded-full bg-chart-3" aria-hidden="true" />}
      {tone === 'info' && <span className="h-0.5 w-2 rounded-full bg-ring" aria-hidden="true" />}
      {tone === 'optional' && (
        <span className="h-0.5 w-2 rounded-full bg-muted-foreground" aria-hidden="true" />
      )}
      {tone === 'warning' && <TriangleAlert className="size-4" aria-hidden="true" />}
      {tone === 'spelling' && (
        <SpellCheck className="size-3" strokeWidth={2.4} aria-hidden="true" />
      )}
      {tone === 'editing' && <Pencil className="size-3" strokeWidth={2.4} aria-hidden="true" />}
    </span>
  );
}

export function RowActions({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-wrap gap-2 max-sm:[&>*]:min-w-0 max-sm:[&>*]:flex-auto max-sm:[&>[data-slot=button]]:px-2 max-sm:[&>[data-slot=button]]:h-11',
        className
      )}
    >
      {children}
    </div>
  );
}

export function DecisionRow({
  tone,
  label,
  actions,
  toggle,
  below,
  testId,
  id,
  wide = false,
  top = false,
  children,
}: {
  tone: Tone;
  label: ReactNode;
  actions?: ReactNode;
  toggle?: ReactNode;
  below?: ReactNode;
  testId?: string;
  id?: string;
  // Field names such as "Periodicitate SU, tehnico-administrativ" wrap in the narrow column.
  wide?: boolean;
  top?: boolean;
  children: ReactNode;
}) {
  const labelId = useId();
  return (
    <div
      id={id}
      role="group"
      aria-labelledby={labelId}
      data-testid={testId}
      data-tone={tone}
      className={cn(
        'grid scroll-mt-32 grid-cols-[1.25rem_minmax(0,1fr)] items-start gap-x-3 gap-y-1 border-t border-border/70 px-4 py-3 sm:min-h-14 sm:grid-cols-[1.25rem_10.5rem_minmax(0,1fr)_auto] sm:gap-x-4 sm:px-5',
        wide && 'sm:grid-cols-[1.25rem_12rem_minmax(0,1fr)_auto]',
        toggle &&
          'grid-cols-[1.25rem_minmax(0,1fr)_auto] sm:grid-cols-[1.25rem_12rem_minmax(0,1fr)_auto_auto]',
        !top && 'sm:items-center',
        rowTones[tone]
      )}
    >
      <StatusDot tone={tone} />
      <span id={labelId} className="text-sm font-medium">
        {label}
      </span>
      {toggle && (
        <div className="col-start-3 row-start-1 flex min-h-5 items-center justify-end sm:col-start-5 sm:min-h-9">
          {toggle}
        </div>
      )}
      <div
        className={cn(
          'col-start-2 grid min-w-0 gap-1 text-sm sm:col-start-auto',
          toggle && 'col-end-[-1] sm:col-end-auto'
        )}
      >
        {children}
      </div>
      {actions && (
        <RowActions
          className={cn(
            'col-start-2 mt-2 sm:col-start-auto sm:mt-0 sm:justify-end',
            toggle && 'col-end-[-1] sm:col-end-auto'
          )}
        >
          {actions}
        </RowActions>
      )}
      {below && <div className="col-start-2 col-end-[-1] mt-2 min-w-0 sm:col-start-2">{below}</div>}
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
  testId,
  display,
  note,
  actions,
  suggestions = [],
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
  testId?: string;
  // The sentence the value sits in while the row is closed.
  display?: (value: ReactNode) => ReactNode;
  note?: ReactNode;
  // Before Redenumește, and kept while the field is open.
  actions?: ReactNode;
  suggestions?: readonly string[];
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

  const renameActions = open ? (
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
  );
  const valueText = (
    <span className="wrap-anywhere" data-testid={`${testIdPrefix}-library-${field}`}>
      {value}
    </span>
  );
  const offered = open ? suggestions.filter((suggestion) => suggestion !== draft.trim()) : [];

  return (
    <DecisionRow
      tone={editable && shownError ? 'todo' : 'done'}
      label={open ? <Label htmlFor={`${id}-input`}>{label}</Label> : label}
      testId={testId}
      actions={
        (actions || editable) && (
          <>
            {actions}
            {editable && renameActions}
          </>
        )
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
      ) : display ? (
        <span>{display(valueText)}</span>
      ) : (
        valueText
      )}
      {offered.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-[13px] text-muted-foreground">
          <span>Sau alege:</span>
          {offered.map((suggestion) => (
            <Button
              key={suggestion}
              type="button"
              variant="outline"
              size="sm"
              className="h-7 max-w-full rounded-full px-2.5 text-[13px]"
              data-testid={`${testIdPrefix}-${field}-suggestion`}
              onClick={() => {
                setDraft(suggestion);
                setDraftError(null);
              }}
            >
              <span className="truncate">{suggestion}</span>
            </Button>
          ))}
        </div>
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
        <>
          {written !== null && written !== value && (
            <span
              id={`${id}-written`}
              className="truncate text-[13px] text-muted-foreground"
              title={written}
            >
              Din document: {written}
            </span>
          )}
          {!open && note}
        </>
      )}
    </DecisionRow>
  );
}
