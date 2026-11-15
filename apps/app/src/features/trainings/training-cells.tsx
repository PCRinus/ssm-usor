import type { TrainingPhase, TrainingSignatureState, TrainingTrainer } from '@ssm-usor/contracts';
import { trainingPhaseLabels } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@ssm-usor/ui/components/dropdown-menu';
import { Lock, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';

import { CellBadge } from '@/components/data-table/cell-badge';
import { CellNote } from '@/components/data-table/cell-note';
import { Masked } from '@/components/replay';
import type { trainingLocks } from '@/features/signatures/use-record-signatures';

import { NotOnSheet } from './not-on-sheet';
import { notOnSheet } from './training-format';

export function TrainerCell({ trainer }: { trainer: TrainingTrainer }) {
  return (
    <>
      {trainer.name === null ? (
        <NotOnSheet>{notOnSheet.name}</NotOnSheet>
      ) : (
        <Masked>{trainer.name}</Masked>
      )}
      {trainer.jobTitle && <CellNote>{trainer.jobTitle}</CellNote>}
    </>
  );
}

export function SignatureState({
  state,
  label,
  testId,
  badgeClassName,
}: {
  state: TrainingSignatureState;
  label: string;
  testId?: string;
  badgeClassName?: string;
}) {
  if (state === 'pending') {
    return (
      <CellBadge tone="warning" className={badgeClassName} data-testid={testId} data-state={state}>
        {label}
      </CellBadge>
    );
  }
  return (
    <span
      data-testid={testId}
      data-state={state}
      className="inline-flex items-center gap-1.5 whitespace-nowrap"
    >
      {state === 'electronic' && (
        <Lock aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
      )}
      {label}
    </span>
  );
}

export function TrainingActions({
  locks,
  label,
  testId,
  onEdit,
  onDelete,
}: {
  locks: ReturnType<typeof trainingLocks>;
  label: string;
  testId: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const lock = locks.edit ?? locks.delete;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          data-testid={`${testId}-row-menu`}
          aria-label={`Acțiuni pentru instruirea ${label}`}
        >
          <MoreHorizontal aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-w-72">
        {lock && (
          <DropdownMenuLabel
            data-testid={`${testId}-lock`}
            className="text-xs font-normal text-muted-foreground"
          >
            <Lock aria-hidden="true" className="mr-1 inline size-3.5 align-[-2px]" />
            {lock}
          </DropdownMenuLabel>
        )}
        <DropdownMenuItem
          data-testid={`${testId}-edit`}
          disabled={locks.edit !== null}
          onSelect={onEdit}
        >
          <Pencil aria-hidden="true" />
          Modifică
        </DropdownMenuItem>
        <DropdownMenuItem
          data-testid={`${testId}-delete`}
          variant="destructive"
          disabled={locks.delete !== null}
          onSelect={onDelete}
        >
          <Trash2 aria-hidden="true" />
          Șterge
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PhaseCell({ phase, note }: { phase: TrainingPhase; note: ReactNode }) {
  return (
    <>
      <span className="font-medium">{trainingPhaseLabels[phase]}</span>
      <CellNote>{note}</CellNote>
    </>
  );
}
