import {
  type TrainingDomain,
  trainingDomainLabels,
  trainingPhaseLabels,
} from '@ssm-usor/contracts';

import type { TrainingListResponseItemsItem } from '@/api/generated/api';
import { createDataTableColumns } from '@/components/data-table/columns';
import { formatDate } from '@/features/employees/employee-format';
import { trainingLocks } from '@/features/signatures/use-record-signatures';

import { TrainingDuration } from './not-on-sheet';
import { PhaseCell, SignatureState, TrainerCell, TrainingActions } from './training-cells';
import { attendeeCountLabel, trainingSignatureLabels, transcribedLabel } from './training-format';

export type TrainingRow = TrainingListResponseItemsItem;

const helper = createDataTableColumns<TrainingRow>();

export const trainingLabel = (training: { phase: TrainingRow['phase']; heldOn: string }) =>
  `${trainingPhaseLabels[training.phase]} din ${formatDate(training.heldOn)}`;

const domainNote = (domain: TrainingDomain, paper: boolean) =>
  paper ? `${trainingDomainLabels[domain]} · ${transcribedLabel}` : trainingDomainLabels[domain];

// Without `onEdit` the client is archived and the rows have no actions. Sortable column ids are
// the API's sort keys.
export function trainingColumns({
  onEdit,
  onDelete,
}: {
  onEdit?: (training: TrainingRow) => void;
  onDelete: (training: TrainingRow) => void;
}) {
  return helper.columns([
    helper.accessor((row) => row.heldOn, {
      id: 'heldOn',
      header: 'Ziua',
      enableSorting: true,
      meta: { cellClassName: 'tabular-nums', skeletonClassName: 'w-24' },
      cell: ({ getValue }) => formatDate(getValue()),
    }),
    helper.display({
      id: 'phase',
      header: 'Instruirea',
      meta: { headerClassName: 'min-w-46', skeletonClassName: 'w-32' },
      cell: ({ row }) => (
        <PhaseCell
          phase={row.original.phase}
          note={domainNote(row.original.domain, row.original.source === 'paper')}
        />
      ),
    }),
    helper.accessor((row) => row.durationMinutes, {
      id: 'duration',
      header: 'Durata',
      enableSorting: true,
      meta: {
        headerClassName: 'min-w-38',
        cellClassName: 'tabular-nums',
        skeletonClassName: 'w-24',
      },
      cell: ({ getValue }) => <TrainingDuration minutes={getValue()} />,
    }),
    helper.accessor((row) => row.trainer.name, {
      id: 'trainer',
      header: 'A instruit',
      enableSorting: true,
      // The one column that takes the spare width; a long name wraps here rather than widen the
      // table.
      meta: {
        headerClassName: 'w-full',
        cellClassName: 'min-w-48 whitespace-normal',
        skeletonClassName: 'w-40',
      },
      cell: ({ row }) => <TrainerCell trainer={row.original.trainer} />,
    }),
    helper.accessor((row) => row.attendeeCount, {
      id: 'attendees',
      header: 'Participanți',
      enableSorting: true,
      meta: { cellClassName: 'tabular-nums', skeletonClassName: 'w-24' },
      cell: ({ getValue }) => (
        <span data-testid="trainings-attendee-count">{attendeeCountLabel(getValue())}</span>
      ),
    }),
    helper.display({
      id: 'signatures',
      header: 'Semnături',
      meta: { skeletonClassName: 'w-24' },
      cell: ({ row }) => {
        const training = row.original;
        const pending = training.pendingTraineeSignatures + training.pendingSignerSignatures;
        return (
          <SignatureState
            state={training.signatureState}
            testId="trainings-signatures"
            label={
              training.signatureState === 'pending'
                ? trainingSignatureLabels.pending(pending)
                : trainingSignatureLabels[training.signatureState]
            }
          />
        );
      },
    }),
    helper.display({
      id: 'actions',
      header: () => <span className="sr-only">Acțiuni</span>,
      meta: { headerClassName: 'w-12', cellClassName: 'text-right', skeletonClassName: 'hidden' },
      cell: ({ row }) =>
        onEdit ? (
          <TrainingActions
            locks={trainingLocks(row.original)}
            label={trainingLabel(row.original)}
            testId="trainings"
            onEdit={() => onEdit(row.original)}
            onDelete={() => onDelete(row.original)}
          />
        ) : null,
    }),
  ]);
}
