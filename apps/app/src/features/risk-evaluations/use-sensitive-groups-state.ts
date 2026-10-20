import { useRouteContext } from '@tanstack/react-router';
import { useState } from 'react';

import {
  getGetDocumentReadinessQueryKey,
  getListRiskEvaluationsQueryKey,
  useUpdateSensitiveGroupsState,
} from '@/api/generated/api';
import { useSavedToast } from '@/features/missing-data/saved-toast';

import { evaluationFailure } from './evaluation-failure';

const messages = {
  none: 'Am notat că clientul nu are lucrători din grupurile sensibile.',
  undecided: 'Întrebarea despre grupurile sensibile este din nou deschisă.',
};

export function useSensitiveGroupsState(clientId: string) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const savedToast = useSavedToast();
  const update = useUpdateSensitiveGroupsState({ request: apiRequest });
  const [failure, setFailure] = useState<string | null>(null);

  async function declare(state: 'none' | 'undecided') {
    setFailure(null);
    let message: string | null = null;
    try {
      await update.mutateAsync({ clientId, data: { state } });
      savedToast(messages[state]);
    } catch (cause) {
      message = evaluationFailure(
        cause,
        'Nu am putut salva răspunsul. Verifică conexiunea și încearcă din nou.'
      );
      setFailure(message);
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getListRiskEvaluationsQueryKey(clientId) }),
      queryClient.invalidateQueries({ queryKey: getGetDocumentReadinessQueryKey(clientId) }),
    ]);
    return message;
  }

  return { declare, pending: update.isPending, failure };
}
