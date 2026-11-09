import { Badge } from '@ssm-usor/ui/components/badge';
import { Button } from '@ssm-usor/ui/components/button';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Check, FileSearch, Pencil, ShieldCheck, SpellCheck } from 'lucide-react';
import { type ComponentProps, type ReactNode, use, useEffect, useId, useRef } from 'react';

import { filesLabel } from './import-format';
import { type LabelledSource, type SectionStatus, spellingCorrection } from './review-model';
import { requestFileName } from './source-match';
import { SourcePrefetchContext } from './source-query';
import { type DiffRun, spellingDiff } from './spelling-diff';

const tones = {
  warning: 'border-warning-border bg-warning text-warning-foreground',
  info: 'border-info-border bg-info text-info-foreground',
  success: 'border-success-border bg-success text-success-foreground',
  destructive: 'border-destructive-border bg-destructive-soft text-destructive-foreground',
  muted: 'border-border bg-secondary text-secondary-foreground',
} as const;

export function Tag({
  tone,
  icon,
  children,
  testId,
  className,
}: {
  tone: keyof typeof tones;
  icon?: ReactNode;
  children: ReactNode;
  testId?: string;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn('rounded-md', tones[tone], className)}
      data-testid={testId}
    >
      {icon}
      {children}
    </Badge>
  );
}

export function StatusTag({ status }: { status: SectionStatus }) {
  switch (status.kind) {
    case 'choice':
      return (
        <Tag tone="warning" testId="section-status">
          Alegere necesară
        </Tag>
      );
    case 'missing':
      return (
        <Tag tone="destructive" testId="section-status">
          {status.count === 1 ? 'O dată lipsă' : `${status.count} date lipsă`}
        </Tag>
      );
    case 'invalid':
      return (
        <Tag tone="destructive" testId="section-status">
          {status.count === 1 ? 'O valoare de corectat' : `${status.count} valori de corectat`}
        </Tag>
      );
    case 'check':
      return (
        <Tag tone="info" testId="section-status">
          De verificat
        </Tag>
      );
    case 'done':
      return (
        <Tag tone="success" icon={<Check aria-hidden="true" />} testId="section-status">
          Gata
        </Tag>
      );
  }
}

export const EditedTag = ({ children = 'Modificat de tine' }: { children?: ReactNode }) => (
  <Tag tone="muted" icon={<Pencil aria-hidden="true" />} testId="edited-tag">
    {children}
  </Tag>
);

export const AnafTag = ({ children }: { children: ReactNode }) => (
  <Tag tone="success" icon={<ShieldCheck aria-hidden="true" />}>
    {children}
  </Tag>
);

export function LinkButton({ children, className, ...props }: ComponentProps<'button'>) {
  return (
    <button
      type="button"
      className={cn(
        'rounded-sm text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50',
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

// Each ask costs the API several reads and signings, so a pointer sweeping down a list of rows asks
// for none of those it only crosses.
const pointerIntentMs = 130;

export function SourceButton({
  sources,
  onOpen,
  label = 'Vezi în document',
  outlined = true,
}: {
  sources: LabelledSource[];
  onOpen: () => void;
  label?: string;
  outlined?: boolean;
}) {
  const prefetch = use(SourcePrefetchContext);
  const intent = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(intent.current), []);
  if (sources.length === 0) return null;
  const warm = () => prefetch?.(sources[0]!);
  const handlers = {
    'data-testid': 'review-source',
    onPointerEnter: () => {
      clearTimeout(intent.current);
      intent.current = setTimeout(warm, pointerIntentMs);
    },
    onPointerLeave: () => clearTimeout(intent.current),
    onFocus: warm,
    onClick: onOpen,
  };
  return outlined ? (
    <Button type="button" variant="outline" {...handlers}>
      <FileSearch aria-hidden="true" />
      {label}
    </Button>
  ) : (
    <LinkButton {...handlers}>{label}</LinkButton>
  );
}

export function SummaryRow({
  id,
  label,
  children,
  actions,
  testId = 'review-row',
}: {
  id?: string;
  label: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  testId?: string;
}) {
  return (
    <div
      id={id}
      data-testid={testId}
      className="grid scroll-mt-32 gap-x-6 gap-y-1 py-3 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)_auto]"
    >
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="grid min-w-0 gap-1 text-sm">{children}</dd>
      {actions && <div className="flex flex-wrap items-start gap-4 sm:justify-end">{actions}</div>}
    </div>
  );
}

const noteTones = {
  danger: 'text-destructive',
  warning: 'font-medium text-warning-foreground',
};

export function RowNote({
  children,
  tone,
  testId,
}: {
  children: ReactNode;
  tone?: keyof typeof noteTones;
  testId?: string;
}) {
  return (
    <span
      className={cn('text-[13px]', tone ? noteTones[tone] : 'text-muted-foreground')}
      data-testid={testId}
    >
      {children}
    </span>
  );
}

export function ReviewCard({
  title,
  description,
  children,
  testId,
  id,
}: {
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  testId?: string;
  id?: string;
}) {
  return (
    <section
      id={id}
      data-testid={testId}
      className="grid scroll-mt-32 gap-1 rounded-xl border bg-card px-5 py-4 shadow-xs"
    >
      {title && <h2 className="text-base font-semibold">{title}</h2>}
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
      {children}
    </section>
  );
}

export function EditButton({
  onClick,
  label = 'Schimbă',
}: {
  onClick: () => void;
  label?: string;
}) {
  return (
    <Button type="button" variant="outline" data-testid="review-edit" onClick={onClick}>
      <Pencil aria-hidden="true" />
      {label}
    </Button>
  );
}

export function SavingNote({ saving }: { saving: boolean }) {
  return (
    <span className="text-xs text-muted-foreground" role="status" aria-live="polite">
      {saving ? 'Se salvează…' : ''}
    </span>
  );
}

function DiffText({ runs, markClassName }: { runs: DiffRun[]; markClassName: string }) {
  return runs.map((run, index) =>
    run.changed ? (
      <mark key={index} className={cn('rounded-xs font-semibold text-inherit', markClassName)}>
        {run.text}
      </mark>
    ) : (
      run.text
    )
  );
}

export function PhoneDigits({ runs }: { runs: DiffRun[] }) {
  return (
    <span className="tabular-nums" data-testid="review-phone">
      <DiffText
        runs={runs}
        markClassName="bg-warning-border underline decoration-2 underline-offset-[3px]"
      />
    </span>
  );
}

export function PickList({
  labelledBy,
  label,
  children,
  testId,
}: {
  labelledBy?: string;
  label?: string;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      aria-label={label}
      className="grid gap-2"
      data-testid={testId}
    >
      {children}
    </div>
  );
}

export function PickOption({
  name,
  checked,
  onPick,
  heading,
  action,
  below,
  testId,
  inDocuments = checked,
  disabled = false,
  children,
}: {
  name: string;
  checked: boolean;
  onPick: () => void;
  heading: ReactNode;
  action?: ReactNode;
  below?: ReactNode;
  testId?: string;
  // False while a value the member is writing is not saved yet.
  inDocuments?: boolean;
  // Shown for what the documents say, but not a value the client can take.
  disabled?: boolean;
  children?: ReactNode;
}) {
  const id = useId();
  return (
    <div
      data-testid={testId}
      data-checked={checked}
      className="grid grid-cols-[1rem_minmax(0,1fr)] items-start gap-x-2.5 gap-y-2 rounded-[10px] border bg-background/60 px-3 py-2.5 has-checked:border-primary has-checked:bg-card has-checked:ring-1 has-checked:ring-primary sm:grid-cols-[1rem_minmax(0,1fr)_auto]"
    >
      <input
        id={id}
        type="radio"
        name={name}
        disabled={disabled}
        className="mt-0.5 size-4 cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-40"
        checked={checked}
        onChange={onPick}
        // A checked radio fires no change, and picking the preselected one is what settles it.
        onClick={checked ? onPick : undefined}
      />
      <label
        htmlFor={id}
        className={cn(
          'grid w-full min-w-0 gap-1',
          disabled ? 'cursor-not-allowed' : 'cursor-pointer'
        )}
      >
        <span className="flex min-h-5 w-full min-w-0 flex-wrap items-center gap-2 text-[12.5px] font-semibold text-muted-foreground">
          {heading}
          {checked && inDocuments && (
            <span className="inline-flex h-5 items-center gap-1 rounded-[5px] bg-primary px-1.5 text-[11.5px] font-semibold text-primary-foreground">
              <Check className="size-3" strokeWidth={3} aria-hidden="true" />
              Intră în documente
            </span>
          )}
        </span>
        {children && <span className="text-sm wrap-anywhere text-foreground">{children}</span>}
      </label>
      {action && <div className="col-start-2 sm:col-start-auto sm:self-center">{action}</div>}
      {below && <div className="col-[2/-1] min-w-0">{below}</div>}
    </div>
  );
}

export function SourceFileNames({ sources }: { sources: LabelledSource[] }) {
  const names = [...new Set(sources.map((source) => requestFileName(source.file)))];
  if (names.length === 0) return 'În documente';
  const others = names.slice(1);
  return (
    <span className="flex max-w-full min-w-0 flex-[0_1_auto]" title={names.join(', ')}>
      <span className="min-w-0 truncate">{names[0]}</span>
      {others.length > 0 && (
        <span className="shrink-0 whitespace-pre">
          {` și încă ${filesLabel(others.length)}`}
          <span className="sr-only">: {others.join(', ')}</span>
        </span>
      )}
    </span>
  );
}

export function KindLine({
  icon,
  tone,
  children,
}: {
  icon: ReactNode;
  tone?: 'warning';
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'flex items-start gap-1.5 text-[13px] [&>svg]:mt-0.5 [&>svg]:size-3.5 [&>svg]:shrink-0',
        tone === 'warning' ? 'font-semibold text-warning-foreground' : 'text-muted-foreground'
      )}
    >
      {icon}
      {children}
    </span>
  );
}

export function SpellingPill({ runs, written }: { runs: DiffRun[]; written: boolean }) {
  return (
    <span
      className={cn(
        'inline-block w-fit max-w-full rounded-md border px-1.5 py-0.5 text-[13px]',
        written
          ? 'border-destructive-border bg-destructive-soft text-destructive-foreground'
          : 'border-success-border bg-success text-success-foreground'
      )}
    >
      <DiffText
        runs={runs}
        markClassName={written ? 'bg-destructive-border' : 'bg-success-border'}
      />
    </span>
  );
}

export function SpellingChoice({
  label,
  corrected,
  written,
  keptWritten,
  onPick,
  showValue = true,
}: {
  label: string;
  corrected: string;
  written: string;
  keptWritten: boolean;
  onPick: (keepWritten: boolean) => void;
  showValue?: boolean;
}) {
  const name = useId();
  const diff = spellingDiff(corrected, written);
  return (
    <details className="group min-w-0" data-testid="review-spelling">
      <summary className="flex cursor-pointer list-none flex-wrap items-baseline gap-x-2 gap-y-1 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <span
          className="min-w-0 text-sm font-medium wrap-anywhere"
          data-testid="review-spelling-preview"
        >
          {showValue ? (keptWritten ? written : corrected) : label}
        </span>
        <span className="inline-flex items-center gap-1 text-[13px] text-muted-foreground group-hover:text-foreground">
          <SpellCheck aria-hidden="true" className="size-3.5 shrink-0" />
          {keptWritten ? 'Ca în document' : 'Scriere corectată'}
          <span aria-hidden="true">·</span>
          <span className="underline underline-offset-2 group-open:hidden">Compară</span>
          <span className="hidden underline underline-offset-2 group-open:inline">
            Închide comparația
          </span>
        </span>
      </summary>
      <div className="mt-2 grid gap-1.5">
        <KindLine icon={<SpellCheck aria-hidden="true" />}>
          Scrierea corectată: {spellingCorrection(corrected, written)}
        </KindLine>
        <PickList label={label}>
          <PickOption
            name={name}
            checked={!keptWritten}
            onPick={() => onPick(false)}
            heading="Scrierea corectată"
            testId="review-spelling-corrected"
          >
            <SpellingPill runs={diff.value} written={false} />
          </PickOption>
          <PickOption
            name={name}
            checked={keptWritten}
            onPick={() => onPick(true)}
            heading="Ca în document"
            testId="review-spelling-written"
          >
            <SpellingPill runs={diff.written} written />
          </PickOption>
        </PickList>
      </div>
    </details>
  );
}
