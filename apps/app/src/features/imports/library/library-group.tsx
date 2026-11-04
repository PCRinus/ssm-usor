import { Link, type LinkProps } from '@tanstack/react-router';
import {
  Check,
  ChevronRight,
  Flame,
  HardHat,
  LoaderCircle,
  type LucideIcon,
  ShieldAlert,
} from 'lucide-react';
import type { ReactNode } from 'react';

import type { ImportDetail } from '@/api/generated/api';
import { HelpLink } from '@/components/help-link';
import { Notice } from '@/components/notice';

import { Tag } from '../review-parts';
import {
  hasInstructionsParts,
  isExpired,
  isInstructionsLibraryPart,
  partDescription,
  partLabels,
  partOrder,
  type PartStatus,
  statusLabels,
} from './library-model';
import { isRisksLibraryPart, risksPartDescription } from './risks-model';
import { useLibraryParts } from './use-library-parts';

const icons = { ssm: HardHat, su: Flame } as const;

export function PartStatusTag({
  part,
}: {
  part: { status: PartStatus; expiresAt: string | null };
}) {
  if (isExpired(part)) {
    return (
      <Tag tone="muted" testId="library-part-status">
        Expirat
      </Tag>
    );
  }
  switch (part.status) {
    case 'reading':
      return (
        <Tag
          tone="muted"
          icon={
            <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
          }
          testId="library-part-status"
        >
          {statusLabels.reading}
        </Tag>
      );
    case 'to_review':
      return (
        <Tag tone="info" testId="library-part-status">
          {statusLabels.to_review}
        </Tag>
      );
    case 'nothing_new':
      return (
        <Tag tone="muted" testId="library-part-status">
          {statusLabels.nothing_new}
        </Tag>
      );
    case 'failed':
      return (
        <Tag tone="destructive" testId="library-part-status">
          {statusLabels.failed}
        </Tag>
      );
    case 'confirmed':
      return (
        <Tag tone="success" icon={<Check aria-hidden="true" />} testId="library-part-status">
          {statusLabels.confirmed}
        </Tag>
      );
  }
}

function TaskLink({
  link,
  part,
  icon: Icon,
  label,
  description,
  status,
}: {
  link: LinkProps;
  part: string;
  icon: LucideIcon;
  label: string;
  description: string;
  status: ReactNode;
}) {
  return (
    <Link
      {...link}
      data-testid="import-library-task"
      data-part={part}
      className="grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-x-3.5 gap-y-1 px-4 py-3.5 transition-colors hover:bg-muted/50 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto_1rem] sm:px-5"
    >
      <span className="grid size-10 place-items-center rounded-lg bg-secondary" aria-hidden="true">
        <Icon className="size-5" />
      </span>
      <span className="grid min-w-0 gap-0.5">
        <span className="font-semibold">{label}</span>
        <span
          className="text-sm text-muted-foreground"
          data-testid="import-library-task-description"
        >
          {description}
        </span>
      </span>
      <span className="justify-self-end">{status}</span>
      <ChevronRight className="size-4 text-muted-foreground max-sm:hidden" aria-hidden="true" />
    </Link>
  );
}

function TaskGroup({
  id,
  testId,
  title,
  help,
  progress,
  intro,
  error,
  pending,
  children,
}: {
  id: string;
  testId: string;
  title: string;
  help: ReactNode;
  progress: string | null;
  intro: string;
  error: string | null;
  pending: boolean;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="grid gap-3" data-testid={testId}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex items-center gap-1">
          <h2 id={id} className="text-lg font-semibold">
            {title}
          </h2>
          {help}
        </div>
        {progress && <span className="text-sm text-muted-foreground tabular-nums">{progress}</span>}
      </div>
      <p className="max-w-3xl text-sm text-muted-foreground">{intro}</p>
      {error && (
        <Notice variant="destructive" data-testid="import-library-error">
          {error}
        </Notice>
      )}
      {pending ? (
        <div className="h-20 animate-pulse rounded-xl bg-muted" aria-busy="true" />
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-xs">{children}</ul>
      )}
    </section>
  );
}

export function LibraryGroup({ detail }: { detail: ImportDetail }) {
  const known = hasInstructionsParts(detail.libraryParts);
  const query = useLibraryParts(detail.id, known);
  if (!known) return null;
  const clientConfirmed = detail.status === 'confirmed';
  const parts = (query.data?.parts ?? [])
    .filter(isInstructionsLibraryPart)
    .sort((a, b) => partOrder.indexOf(a.part) - partOrder.indexOf(b.part));
  const done = parts.filter((part) => part.status === 'confirmed').length;

  return (
    <TaskGroup
      id="import-library-heading"
      testId="import-library-group"
      title="Instrucțiuni proprii"
      help={<HelpLink topic="import.instructiuni-proprii" label="Ajutor: Instrucțiuni proprii" />}
      progress={parts.length > 0 ? `${done} din ${parts.length} confirmate` : null}
      intro={
        clientConfirmed
          ? 'Instrucțiunile din pachet, pentru biblioteca ta. Le confirmi fiecare pe rând, în cel mult 14 zile de la crearea clientului.'
          : 'Instrucțiunile din pachet, pentru biblioteca ta. Le poți verifica de acum, dar le confirmi după client: nu te opresc să-l creezi.'
      }
      error={query.isError ? 'Nu am putut încărca instrucțiunile proprii. Reîncarcă pagina.' : null}
      pending={query.isPending}
    >
      {parts.map((part) => (
        <li key={part.part}>
          <TaskLink
            link={{
              to: '/clienti/import/$importId/instructiuni/$domain',
              params: { importId: detail.id, domain: part.domain },
            }}
            part={part.part}
            icon={icons[part.domain]}
            label={partLabels[part.part]}
            description={partDescription(part, clientConfirmed)}
            status={<PartStatusTag part={part} />}
          />
        </li>
      ))}
    </TaskGroup>
  );
}

export function RisksGroup({ detail }: { detail: ImportDetail }) {
  const known = detail.libraryParts.some((part) => part.part === 'risk_evaluations');
  const query = useLibraryParts(detail.id, known);
  if (!known) return null;
  const clientConfirmed = detail.status === 'confirmed';
  const part = query.data?.parts.find(isRisksLibraryPart);

  return (
    <TaskGroup
      id="import-risks-heading"
      testId="import-risks-group"
      title="Evaluări de risc"
      help={<HelpLink topic="import.evaluari-de-risc" label="Ajutor: Evaluări de risc" />}
      progress={null}
      intro={
        clientConfirmed
          ? 'Fișele de evaluare din pachet, pentru biblioteca ta și pentru posturile clientului. Le confirmi în cel mult 14 zile de la crearea clientului.'
          : 'Fișele de evaluare din pachet, pentru biblioteca ta și pentru posturile clientului. Le poți verifica de acum, dar le confirmi după client: nu te opresc să-l creezi.'
      }
      error={query.isError ? 'Nu am putut încărca evaluările de risc. Reîncarcă pagina.' : null}
      pending={query.isPending}
    >
      {part && (
        <li>
          <TaskLink
            link={{
              to: '/clienti/import/$importId/evaluari-de-risc',
              params: { importId: detail.id },
            }}
            part={part.part}
            icon={ShieldAlert}
            label="Fișe de evaluare"
            description={risksPartDescription(part, clientConfirmed)}
            status={<PartStatusTag part={part} />}
          />
        </li>
      )}
    </TaskGroup>
  );
}
