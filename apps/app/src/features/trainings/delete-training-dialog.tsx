import { type TrainingPhase, trainingPhaseLabels } from '@ssm-usor/contracts';
import { toast } from '@ssm-usor/ui/lib/toast';
import { useRouteContext } from '@tanstack/react-router';
import { useState } from 'react';

import { getGetTrainingQueryKey, useDeleteTraining, useGetTraining } from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { signingMessage } from '@/features/signatures/signature-format';
import { formatDate } from '@/lib/dates';

import { attendeeCountLabel } from './training-format';
import { invalidateTrainings } from './training-queries';

export interface TrainingToDelete {
  id: string;
  phase: TrainingPhase;
  heldOn: string;
  // Unknown on an employee's page, which lists their own record only.
  attendeeCount?: number;
}

export function DeleteTrainingDialog({
  clientId,
  userId,
  training,
  onClose,
}: {
  clientId: string;
  userId: string;
  training: TrainingToDelete | null;
  onClose: () => void;
}) {
  return (
    training && (
      <DeleteTrainingConfirm
        key={training.id}
        clientId={clientId}
        userId={userId}
        training={training}
        onClose={onClose}
      />
    )
  );
}

function DeleteTrainingConfirm({
  clientId,
  userId,
  training,
  onClose,
}: {
  clientId: string;
  userId: string;
  training: TrainingToDelete;
  onClose: () => void;
}) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const remove = useDeleteTraining({ request: apiRequest });
  const [error, setError] = useState<string | null>(null);
  const detail = useGetTraining(clientId, training.id, {
    request: apiRequest,
    query: {
      queryKey: [...getGetTrainingQueryKey(clientId, training.id), userId],
      enabled: training.attendeeCount === undefined && Boolean(apiRequest.baseUrl),
    },
  });
  const attendeeCount = training.attendeeCount ?? detail.data?.training.records.length;

  async function confirm() {
    setError(null);
    try {
      await remove.mutateAsync({ clientId, trainingId: training.id });
      toast.success('Instruirea a fost ștearsă.');
      onClose();
    } catch (cause) {
      if (!(cause instanceof ApiHttpError && cause.status === 404)) {
        setError(
          signingMessage(cause) ??
            (cause instanceof ApiHttpError && cause.status === 409
              ? 'Clientul este arhivat; instruirile lui nu mai pot fi șterse.'
              : 'Nu am putut șterge instruirea. Verifică conexiunea și încearcă din nou.')
        );
        return;
      }
      onClose();
    } finally {
      await invalidateTrainings(queryClient, clientId);
    }
  }

  return (
    <ConfirmDialog
      open
      busy={remove.isPending}
      testId="training-delete"
      title="Ștergi instruirea?"
      confirmLabel="Șterge instruirea"
      pendingLabel="Se șterge…"
      error={error}
      onConfirm={confirm}
      onClose={onClose}
    >
      Instruirea {trainingPhaseLabels[training.phase].toLowerCase()} din{' '}
      {formatDate(training.heldOn)} dispare din fișele participanților.
      {attendeeCount !== undefined && attendeeCount > 1 && (
        <>
          {' '}
          <span className="font-medium text-foreground" data-testid="training-delete-count">
            Are {attendeeCountLabel(attendeeCount)}; ștergerea îi privește pe toți.
          </span>
        </>
      )}
    </ConfirmDialog>
  );
}
