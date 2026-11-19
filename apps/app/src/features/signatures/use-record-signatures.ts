import {
  getGetRecordSignaturesQueryKey,
  type RecordSignaturesResponse,
  useGetRecordSignatures,
} from '@/api/generated/api';
import { useApi } from '@/api/use-api';

import { printedTrainingMessage } from './signature-format';

export function useRecordSignatures(clientId: string, recordId: string, enabled: boolean) {
  const { request, ready, key } = useApi();
  return useGetRecordSignatures(clientId, recordId, {
    request,
    query: {
      queryKey: key(getGetRecordSignaturesQueryKey(clientId, recordId)),
      enabled: enabled && ready,
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
