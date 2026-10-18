import { useRouteContext } from '@tanstack/react-router';

import {
  getGetRecordSignaturesQueryKey,
  type RecordSignaturesResponseSlotsItem,
  useGetRecordSignatures,
} from '@/api/generated/api';

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

// A voided signature also keeps a record from being deleted, which the slots cannot show; the
// API's refusal stays the last word.
export function recordLocks(slots: readonly RecordSignaturesResponseSlotsItem[] | undefined) {
  const signed = slots?.some((slot) => slot.state === 'signed') ?? false;
  const paper = slots?.some((slot) => slot.state === 'paper') ?? false;
  const frozen = 'Semnată electronic: anulează semnăturile ca s-o poți modifica sau șterge.';
  return {
    edit: signed ? frozen : null,
    delete: signed ? frozen : paper ? 'Are semnături pe hârtie, care rămân în evidență.' : null,
  };
}
