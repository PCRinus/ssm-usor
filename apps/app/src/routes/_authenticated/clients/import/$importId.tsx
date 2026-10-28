import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { getGetImportQueryKey, getGetImportQueryOptions } from '@/api/generated/api';
import { ImportReviewScope } from '@/features/imports/import-review-scope';

export const Route = createFileRoute('/_authenticated/clients/import/$importId')({
  params: { parse: (params) => ({ importId: z.uuid().parse(params.importId) }) },
  staticData: { title: 'Import din documente' },
  loader: async ({ params, context: { apiRequest, queryClient, auth } }) => {
    const userId = auth.getSnapshot().session?.user.id;
    try {
      const { import: detail } = await queryClient.ensureQueryData(
        getGetImportQueryOptions(params.importId, {
          request: apiRequest,
          query: { queryKey: [...getGetImportQueryKey(params.importId), userId] },
        })
      );
      return {
        crumb: detail.intoExistingClient ? 'Completare din documentație' : 'Import din documente',
      };
    } catch {
      return { crumb: 'Import din documente' };
    }
  },
  component: ImportReviewScope,
});
