import { type TrainingPhase, trainingPhaseLabels } from '@ssm-usor/contracts';
import { toast } from '@ssm-usor/ui/lib/toast';
import { useState } from 'react';

import { getGetTrainingQueryKey, useDeleteTraining, useGetTraining } from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { useApi } from '@/api/use-api';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { signingMessage } from '@/features/signatures/signature-format';
import { commonFailure } from '@/lib/api-errors';
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
  training,
  onClose,
}: {
  clientId: string;
  training: TrainingToDelete | null;
  onClose: () => void;
}) {
  return (
    training && (
      <DeleteTrainingConfirm
        key={training.id}
        clientId={clientId}
        training={training}
        onClose={onClose}
      />
    )
  );
}

function DeleteTrainingConfirm({
  clientId,
  training,
  onClose,
}: {
  clientId: string;
  training: TrainingToDelete;
  onClose: () => void;
}) {
  const { request, queryClient, key } = useApi();
  const remove = useDeleteTraining({ request });
  const [error, setError] = useState<string | null>(null);
  const detail = useGetTraining(clientId, training.id, {
    request,
    query: {
      queryKey: key(getGetTrainingQueryKey(clientId, training.id)),
      enabled: training.attendeeCount === undefined && Boolean(request.baseUrl),
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
              : (commonFailure(cause) ??
                'Nu am putut șterge instruirea. Verifică conexiunea și încearcă din nou.'))
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
