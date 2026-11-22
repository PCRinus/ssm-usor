import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { getGetImportQueryKey, getGetImportQueryOptions } from '@/api/generated/api';
import { withUserId } from '@/api/use-api';
import { ImportReviewScope } from '@/features/imports/import-review-scope';

export const Route = createFileRoute('/_authenticated/clienti/import/$importId')({
  params: { parse: (params) => ({ importId: z.uuid().parse(params.importId) }) },
  staticData: { title: 'Import din documente' },
  loader: async ({ params, context: { apiRequest, queryClient, auth } }) => {
    const key = withUserId(auth.getSnapshot().session?.user.id);
    try {
      const { import: detail } = await queryClient.ensureQueryData(
        getGetImportQueryOptions(params.importId, {
          request: apiRequest,
          query: { queryKey: key(getGetImportQueryKey(params.importId)) },
        })
      );
      return {
        crumb: detail.intoExistingClient
          ? 'Import pentru un client existent'
          : 'Import din documente',
      };
    } catch {
      return { crumb: 'Import din documente' };
    }
  },
  component: ImportReviewScope,
});
