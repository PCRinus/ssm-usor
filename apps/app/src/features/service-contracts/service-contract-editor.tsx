import { useRouteContext } from '@tanstack/react-router';
import type { ReactNode } from 'react';

import { getGetServiceContractQueryKey, useGetServiceContract } from '@/api/generated/api';
import { DocumentEditorView } from '@/features/documents/document-editor-page';

// The contract in the editor the documentation set uses. It is found through its own route
// of the API, because the list of a client's documents is the documentation set only.
export function ServiceContractEditor({
  clientId,
  companyName,
  userId,
  readOnly,
  readOnlyReason,
  back,
}: {
  clientId: string;
  companyName: string;
  userId: string;
  readOnly: boolean;
  readOnlyReason?: { label: string; title: string };
  back: ReactNode;
}) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const queryKey = [...getGetServiceContractQueryKey(clientId), userId];
  const contract = useGetServiceContract(clientId, { request: apiRequest, query: { queryKey } });
  return (
    <DocumentEditorView
      readOnly={readOnly}
      readOnlyReason={readOnlyReason}
      source={{
        document: contract.data?.document ?? undefined,
        isPending: contract.isPending,
        isError: contract.isError,
        isSuccess: contract.isSuccess,
        refetch: () => void contract.refetch(),
        invalidate: () => queryClient.invalidateQueries({ queryKey }),
        // Every contract has the same title, so the company is named beside it.
        back: (
          <span className="flex min-w-0 items-center gap-1">
            {back}
            <span
              data-testid="editor-company"
              className="max-w-40 truncate text-sm text-muted-foreground sm:max-w-72"
            >
              {companyName}
            </span>
          </span>
        ),
      }}
    />
  );
}
