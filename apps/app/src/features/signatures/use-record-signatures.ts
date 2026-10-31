import { useRouteContext } from '@tanstack/react-router';

import {
  getGetRecordSignaturesQueryKey,
  type RecordSignaturesResponse,
  useGetRecordSignatures,
} from '@/api/generated/api';

import { printedTrainingMessage } from './signature-format';

export function useRecordSignatures(
  clientId: string,
  recordId: string,
  userId: string,
  enabled: boolean
) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  return useGetRecordSignatures(clientId, recordId, {
    request: apiRequest,
    query: {
      queryKey: [...getGetRecordSignaturesQueryKey(clientId, recordId), userId],
      enabled: enabled && Boolean(userId && apiRequest.baseUrl),
    },
  });
}

export type TrainingSigning = { signed: boolean; hasSignatures: boolean; printed: boolean };

// Any record of a training freezes all of it, so one record's own slots cannot lock it alone.
export function trainingLocks(training: TrainingSigning, signatures?: RecordSignaturesResponse) {
  if (training.printed) return { edit: printedTrainingMessage, delete: printedTrainingMessage };
  const signed =
    training.signed || (signatures?.slots.some((slot) => slot.state === 'signed') ?? false);
  const kept = training.hasSignatures || (signatures?.hasSignatures ?? false);
  const frozen =
    'Instruirea este semnată electronic. Anulează semnăturile ca să o poți modifica sau șterge.';
  return {
    edit: signed ? frozen : null,
    delete: signed
      ? frozen
      : kept
        ? 'Instruirea are semnături, chiar anulate sau pe hârtie, care rămân în evidență, așa că nu se mai poate șterge.'
        : null,
  };
}
