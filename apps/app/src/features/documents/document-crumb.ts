import type { DocumentSet } from '@ssm-usor/contracts';
import type { QueryClient } from '@tanstack/react-query';

import {
  getListClientDocumentsQueryKey,
  getListClientDocumentsQueryOptions,
} from '@/api/generated/api';
import type { ApiRequestOptions } from '@/api/http';

import { datedTitle } from './document-labels';
import { setParams } from './document-sets';

// There is no request for one document: the loader warms the list the editor page reads, under
// the same key, and names the document from it.
export async function documentCrumb({
  clientId,
  documentId,
  set,
  userId,
  apiRequest,
  queryClient,
}: {
  clientId: string;
  documentId: string;
  set: DocumentSet;
  userId: string | undefined;
  apiRequest: ApiRequestOptions;
  queryClient: QueryClient;
}) {
  try {
    const { items } = await queryClient.ensureQueryData(
      getListClientDocumentsQueryOptions(clientId, setParams(set), {
        request: apiRequest,
        query: { queryKey: [...getListClientDocumentsQueryKey(clientId, setParams(set)), userId] },
      })
    );
    const item = items.find((each) => each.id === documentId);
    return { crumb: item && (item.period === null ? item.title : datedTitle(item)) };
  } catch {
    return { crumb: undefined };
  }
}
