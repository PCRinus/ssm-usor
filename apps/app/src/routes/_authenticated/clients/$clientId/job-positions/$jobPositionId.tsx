import { createFileRoute, notFound, Outlet } from '@tanstack/react-router';
import { z } from 'zod';

import { getListJobPositionsQueryKey, getListJobPositionsQueryOptions } from '@/api/generated/api';
import { JobPositionError, JobPositionNotFound } from '@/features/job-positions/job-position-page';
import { JobPositionPending } from '@/features/job-positions/job-position-pending';

// A position is read from the client's list, which is a handful of rows and already cached
// by the positions section; there is no request for one position. The loader warms it and
// names the breadcrumb, for the position's page and the pages under it.
export const Route = createFileRoute(
  '/_authenticated/clients/$clientId/job-positions/$jobPositionId'
)({
  params: { parse: (params) => ({ jobPositionId: z.uuid().parse(params.jobPositionId) }) },
  loader: async ({ params, context: { apiRequest, queryClient, auth } }) => {
    const userId = auth.getSnapshot().session?.user.id;
    const { items } = await queryClient.ensureQueryData(
      getListJobPositionsQueryOptions(params.clientId, {
        request: apiRequest,
        query: { queryKey: [...getListJobPositionsQueryKey(params.clientId), userId] },
      })
    );
    const position = items.find((item) => item.id === params.jobPositionId);
    if (!position) throw notFound();
    return { crumb: position.name };
  },
  component: Outlet,
  pendingComponent: JobPositionPending,
  notFoundComponent: JobPositionNotFound,
  errorComponent: JobPositionError,
});
