import { Link } from '@tanstack/react-router';
import { ChevronRight } from 'lucide-react';

import { openedHere } from '@/app/opener';
import { CellNote } from '@/components/data-table/cell-note';
import { createDataTableColumns } from '@/components/data-table/columns';
import {
  instructionCountOf,
  instructionStateLabel,
} from '@/features/instructions/instruction-schema';
import { equipmentStateLabel } from '@/features/protective-equipment/equipment-schema';
import {
  evaluationLevelLabel,
  evaluationNeedsAttention,
  factorsNote,
} from '@/features/risk-evaluations/risk-evaluation-schema';

import { DecisionBadge } from './decision-badge';
import { PositionMenu, StateLink, WorkersCell } from './job-position-cells';
import type { JobPositionRow } from './job-position-list';
import { intervalLabel, type JobPosition, staffCategoryShortLabels } from './job-position-schema';
import { positionSections } from './position-sections';

const helper = createDataTableColumns<JobPositionRow>();

const headerLines = (first: string, second: string) => () => (
  <span className="whitespace-normal leading-tight">
    {first}
    <br />
    {second}
  </span>
);

/** "Execuție · Birou · instruire la 3 luni": the interval only when the post has its own. */
export function positionFacts(position: JobPosition) {
  const interval = position.trainingIntervalMonths;
  return [
    staffCategoryShortLabels[position.staffCategory],
    position.workZone,
    interval && (interval === 1 ? 'instruire lunară' : `instruire ${intervalLabel(interval)}`),
  ]
    .filter(Boolean)
    .join(' · ');
}

// An archived client's posts are only read: nothing is left to decide, so nothing is amber.
const toneOf = (decision: boolean | null, readOnly: boolean) =>
  readOnly ? (decision ?? false) : decision;

// Sortable column ids are the list's sort keys.
export function jobPositionColumns({
  clientId,
  readOnly,
  onEdit,
  onRemove,
}: {
  clientId: string;
  readOnly: boolean;
  onEdit: (position: JobPosition) => void;
  onRemove: (position: JobPosition) => void;
}) {
  return helper.columns([
    helper.accessor((row) => row.position.name, {
      id: 'name',
      header: 'Post',
      enableSorting: true,
      meta: {
        headerClassName: 'w-full min-w-55',
        cellClassName: 'whitespace-normal',
        skeletonClassName: 'w-40',
      },
      cell: ({ row }) => {
        const { position } = row.original;
        return (
          <>
            <Link
              to="/clienti/$clientId/posturi/$jobPositionId"
              state={openedHere}
              params={{ clientId, jobPositionId: position.id }}
              data-testid="job-position-open"
              className="font-medium [overflow-wrap:anywhere] hover:underline"
            >
              {position.name}
            </Link>
            <CellNote className="[overflow-wrap:anywhere]" data-testid="job-position-facts">
              {positionFacts(position)}
            </CellNote>
          </>
        );
      },
    }),
    helper.accessor((row) => row.position.employeeCount, {
      id: 'employees',
      header: 'Lucrători',
      enableSorting: true,
      sortDescFirst: true,
      meta: { headerClassName: 'min-w-32', skeletonClassName: 'w-20' },
      cell: ({ row }) => (
        <WorkersCell clientId={clientId} position={row.original.position} readOnly={readOnly} />
      ),
    }),
    helper.display({
      id: 'equipment',
      header: 'EIP',
      meta: { headerClassName: 'min-w-32', skeletonClassName: 'w-20' },
      cell: ({ row }) => {
        const { position } = row.original;
        return (
          <StateLink
            clientId={clientId}
            position={position}
            section={positionSections.equipment}
            decision={toneOf(position.needsProtectiveEquipment, readOnly)}
            label={equipmentStateLabel(position)}
            testId="job-position-equipment"
          />
        );
      },
    }),
    ...(['ssm', 'su'] as const).map((domain) =>
      helper.display({
        id: domain === 'ssm' ? 'instructions' : 'fireInstructions',
        header: headerLines('Instrucțiuni', domain === 'ssm' ? 'SSM' : 'SU'),
        meta: { headerClassName: 'min-w-38', skeletonClassName: 'w-24' },
        cell: ({ row }) => {
          const { position } = row.original;
          const count = instructionCountOf(position, domain);
          return (
            <StateLink
              clientId={clientId}
              position={position}
              section={
                domain === 'ssm' ? positionSections.instructions : positionSections.fireInstructions
              }
              decision={toneOf(count > 0 || null, readOnly)}
              label={instructionStateLabel(count)}
              testId={
                domain === 'ssm' ? 'job-position-instructions' : 'job-position-fire-instructions'
              }
            />
          );
        },
      })
    ),
    helper.accessor((row) => row.evaluation?.globalRiskLevel ?? null, {
      id: 'risk',
      header: headerLines('Fișa de evaluare', 'a riscurilor'),
      enableSorting: true,
      sortDescFirst: true,
      meta: { headerClassName: 'min-w-43', skeletonClassName: 'w-28' },
      cell: ({ row }) => {
        const { position, evaluation } = row.original;
        if (evaluation === undefined) return <span className="text-muted-foreground">—</span>;
        const evaluated = evaluation !== null && evaluation.factorCount > 0;
        return (
          <>
            <DecisionBadge
              asChild
              decision={toneOf(!evaluationNeedsAttention(evaluation) || null, readOnly)}
            >
              <Link
                to="/clienti/$clientId/posturi/$jobPositionId/fisa-de-evaluare"
                state={openedHere}
                params={{ clientId, jobPositionId: position.id }}
                data-testid="job-position-risk"
              >
                {evaluationLevelLabel(evaluation)}
                <ChevronRight aria-hidden="true" />
              </Link>
            </DecisionBadge>
            {evaluated && evaluation.globalRiskLevel !== null && (
              <CellNote data-testid="job-position-factors">
                {factorsNote(evaluation.factorCount)}
              </CellNote>
            )}
          </>
        );
      },
    }),
    helper.display({
      id: 'actions',
      header: () => <span className="sr-only">Acțiuni</span>,
      meta: { headerClassName: 'w-14', cellClassName: 'text-right', skeletonClassName: 'hidden' },
      cell: ({ row }) => (
        <PositionMenu
          clientId={clientId}
          position={row.original.position}
          readOnly={readOnly}
          onEdit={onEdit}
          onRemove={onRemove}
        />
      ),
    }),
  ]);
}
