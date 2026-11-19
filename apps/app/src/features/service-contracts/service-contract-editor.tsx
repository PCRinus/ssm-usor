import { cn } from '@ssm-usor/ui/lib/utils';
import type { ReactNode } from 'react';

import { getGetServiceContractQueryKey, useGetServiceContract } from '@/api/generated/api';
import { useApi } from '@/api/use-api';
import { backGap } from '@/components/back-gap';
import { DocumentEditorView } from '@/features/documents/document-editor-page';

// The contract in the editor the documentation set uses. It is found through its own route
// of the API, because the list of a client's documents is the documentation set only.
export function ServiceContractEditor({
  clientId,
  companyName,
  readOnly,
  readOnlyReason,
  back,
}: {
  clientId: string;
  companyName: string;
  readOnly: boolean;
  readOnlyReason?: { label: string; title: string };
  back: ReactNode;
}) {
  const { request, queryClient, key } = useApi();
  const queryKey = key(getGetServiceContractQueryKey(clientId));
  const contract = useGetServiceContract(clientId, { request, query: { queryKey } });
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
        arrow: back,
        back: (
          <span className={cn('flex min-w-0 items-center', backGap)}>
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
