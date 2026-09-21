import { useRouteContext } from '@tanstack/react-router';
import type { ReactNode } from 'react';

import { getGetServiceContractQueryKey, useGetServiceContract } from '../api/generated/api';
import { DocumentEditorView } from '../documents/document-editor-page';

// The contract in the editor the documentation set uses. It is found through its own route
// of the API, because the list of a client's documents is the documentation set only.
export function ServiceContractEditor({
  clientId,
  userId,
  readOnly,
  back,
}: {
  clientId: string;
  userId: string;
  readOnly: boolean;
  back: ReactNode;
}) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const queryKey = [...getGetServiceContractQueryKey(clientId), userId];
  const contract = useGetServiceContract(clientId, { request: apiRequest, query: { queryKey } });
  return (
    <DocumentEditorView
      readOnly={readOnly}
      source={{
        document: contract.data?.document ?? undefined,
        isPending: contract.isPending,
        isError: contract.isError,
        isSuccess: contract.isSuccess,
        refetch: () => void contract.refetch(),
        invalidate: () => queryClient.invalidateQueries({ queryKey }),
        back,
      }}
    />
  );
}
