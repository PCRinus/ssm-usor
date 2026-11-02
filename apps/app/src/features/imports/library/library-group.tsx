import { Link } from '@tanstack/react-router';
import { Check, ChevronRight, Flame, HardHat, LoaderCircle } from 'lucide-react';

import type { ImportDetail } from '@/api/generated/api';
import { HelpLink } from '@/components/help-link';
import { Notice } from '@/components/notice';

import { Tag } from '../review-parts';
import {
  isExpired,
  type LibraryPart,
  partDescription,
  partLabels,
  partOrder,
  statusLabels,
} from './library-model';
import { useLibraryParts } from './use-library-parts';

const icons = { ssm: HardHat, psi: Flame } as const;

export function PartStatusTag({ part }: { part: LibraryPart }) {
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

export function LibraryGroup({ detail }: { detail: ImportDetail }) {
  const known = detail.libraryParts.length > 0;
  const query = useLibraryParts(detail.id, known);
  if (!known) return null;
  const clientConfirmed = detail.status === 'confirmed';
  const parts = [...(query.data?.parts ?? [])].sort(
    (a, b) => partOrder.indexOf(a.part) - partOrder.indexOf(b.part)
  );
  const done = parts.filter((part) => part.status === 'confirmed').length;

  return (
    <section
      aria-labelledby="import-library-heading"
      className="grid gap-3"
      data-testid="import-library-group"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex items-center gap-1">
          <h2 id="import-library-heading" className="text-lg font-semibold">
            Instrucțiuni proprii
          </h2>
          <HelpLink topic="import.instructiuni-proprii" label="Ajutor: Instrucțiuni proprii" />
        </div>
        {parts.length > 0 && (
          <span className="text-sm text-muted-foreground tabular-nums">
            {done} din {parts.length} confirmate
          </span>
        )}
      </div>
      <p className="max-w-3xl text-sm text-muted-foreground">
        {clientConfirmed
          ? 'Instrucțiunile din pachet, pentru biblioteca ta. Le confirmi fiecare pe rând, în cel mult 14 zile de la crearea clientului.'
          : 'Instrucțiunile din pachet, pentru biblioteca ta. Le poți verifica de acum, dar le confirmi după client: nu te opresc să-l creezi.'}
      </p>
      {query.isError && (
        <Notice variant="destructive" data-testid="import-library-error">
          Nu am putut încărca instrucțiunile proprii. Reîncarcă pagina.
        </Notice>
      )}
      {query.isPending ? (
        <div className="h-20 animate-pulse rounded-xl bg-muted" aria-busy="true" />
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-xs">
          {parts.map((part) => {
            const domain = part.domain;
            const Icon = icons[domain];
            return (
              <li key={part.part}>
                <Link
                  to="/clients/import/$importId/instructions/$domain"
                  params={{ importId: detail.id, domain }}
                  data-testid="import-library-task"
                  data-part={part.part}
                  className="grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-x-3.5 gap-y-1 px-4 py-3.5 transition-colors hover:bg-muted/50 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto_1rem] sm:px-5"
                >
                  <span
                    className="grid size-10 place-items-center rounded-lg bg-secondary"
                    aria-hidden="true"
                  >
                    <Icon className="size-5" />
                  </span>
                  <span className="grid min-w-0 gap-0.5">
                    <span className="font-semibold">{partLabels[part.part]}</span>
                    <span
                      className="text-sm text-muted-foreground"
                      data-testid="import-library-task-description"
                    >
                      {partDescription(part, clientConfirmed)}
                    </span>
                  </span>
                  <span className="justify-self-end">
                    <PartStatusTag part={part} />
                  </span>
                  <ChevronRight
                    className="size-4 text-muted-foreground max-sm:hidden"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
