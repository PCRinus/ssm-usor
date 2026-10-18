import { useRouteContext } from '@tanstack/react-router';

import {
  getGetRecordSignaturesQueryKey,
  type RecordSignaturesResponse,
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

export function recordLocks(signatures: RecordSignaturesResponse | undefined) {
  const signed = signatures?.slots.some((slot) => slot.state === 'signed') ?? false;
  const frozen = 'Semnată electronic: anulează semnăturile ca s-o poți modifica sau șterge.';
  return {
    edit: signed ? frozen : null,
    delete: signed
      ? frozen
      : signatures?.hasSignatures
        ? 'Are semnături, chiar anulate sau pe hârtie, care rămân în evidență: nu se mai poate șterge.'
        : null,
  };
}
