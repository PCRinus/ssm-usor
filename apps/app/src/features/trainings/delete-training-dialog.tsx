import { type TrainingPhase, trainingPhaseLabels } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ssm-usor/ui/components/dialog';
import { toast } from '@ssm-usor/ui/lib/toast';
import { useRouteContext } from '@tanstack/react-router';
import { useState } from 'react';

import { getGetTrainingQueryKey, useDeleteTraining, useGetTraining } from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { Notice } from '@/components/notice';
import { formatDate } from '@/features/employees/employee-format';

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
    <Dialog open={training !== null} onOpenChange={(open) => !open && onClose()}>
      {training && (
        <DeleteTrainingContent
          key={training.id}
          clientId={clientId}
          userId={userId}
          training={training}
          onClose={onClose}
        />
      )}
    </Dialog>
  );
}

function DeleteTrainingContent({
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
          cause instanceof ApiHttpError && cause.status === 409
            ? 'Clientul este arhivat; instruirile lui nu mai pot fi șterse.'
            : 'Nu am putut șterge instruirea. Verifică conexiunea și încearcă din nou.'
        );
        return;
      }
      onClose();
    } finally {
      await invalidateTrainings(queryClient, clientId);
    }
  }

  return (
    <DialogContent data-testid="training-delete-dialog" className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Ștergi instruirea?</DialogTitle>
        <DialogDescription>
          Instruirea {trainingPhaseLabels[training.phase].toLowerCase()} din{' '}
          {formatDate(training.heldOn)} dispare din fișele participanților.
          {attendeeCount !== undefined && attendeeCount > 1 && (
            <>
              {' '}
              <span className="font-medium text-foreground" data-testid="training-delete-count">
                Are {attendeeCount} participanți; ștergerea îi privește pe toți.
              </span>
            </>
          )}
        </DialogDescription>
      </DialogHeader>
      {error && (
        <Notice variant="destructive" data-testid="training-delete-error">
          {error}
        </Notice>
      )}
      <DialogFooter className="mt-2">
        <Button variant="ghost" disabled={remove.isPending} onClick={onClose}>
          Renunță
        </Button>
        <Button
          variant="destructive"
          data-testid="training-delete-confirm"
          disabled={remove.isPending}
          onClick={() => void confirm()}
        >
          {remove.isPending ? 'Se șterge…' : 'Șterge instruirea'}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
