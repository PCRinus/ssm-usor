import { Badge } from '@ssm-usor/ui/components/badge';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Check, Pencil, ShieldCheck } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';

import { type SectionStatus, type Source, spellingCorrection } from './review-model';

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
}: {
  tone: keyof typeof tones;
  icon?: ReactNode;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <Badge variant="outline" className={cn('rounded-md', tones[tone])} data-testid={testId}>
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

export const EditedTag = () => (
  <Tag tone="muted" icon={<Pencil aria-hidden="true" />} testId="edited-tag">
    Modificat de tine
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

export function SourceButton({
  sources,
  onOpen,
  label = 'Sursa',
}: {
  sources: Source[];
  onOpen: () => void;
  label?: string;
}) {
  if (sources.length === 0) return null;
  return (
    <LinkButton data-testid="review-source" onClick={onOpen}>
      {label}
    </LinkButton>
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

export function EditButton({ onClick }: { onClick: () => void }) {
  return (
    <LinkButton data-testid="review-edit" onClick={onClick}>
      Schimbă
    </LinkButton>
  );
}

export function SavingNote({ saving }: { saving: boolean }) {
  return (
    <span className="text-xs text-muted-foreground" role="status" aria-live="polite">
      {saving ? 'Se salvează…' : ''}
    </span>
  );
}

export function SpellingPair({
  label,
  value,
  written,
  onKeep,
}: {
  label?: string;
  value: string;
  written: string;
  onKeep: () => void;
}) {
  return (
    <span
      className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]"
      data-testid="review-spelling"
    >
      {label && <span className="text-muted-foreground">{label}:</span>}
      <span className="rounded-md border border-success-border bg-success px-1.5 py-0.5 text-success-foreground wrap-anywhere">
        <span className="sr-only">Propus: </span>
        {value}
      </span>
      <span className="rounded-md border border-destructive-border bg-destructive-soft px-1.5 py-0.5 text-destructive-foreground wrap-anywhere">
        <span className="sr-only">În document: </span>
        {written}
      </span>
      <span className="text-muted-foreground">
        Scrierea corectată: {spellingCorrection(value, written)}
      </span>
      <LinkButton className="text-[13px]" onClick={onKeep}>
        Păstrează ca în document
      </LinkButton>
    </span>
  );
}
