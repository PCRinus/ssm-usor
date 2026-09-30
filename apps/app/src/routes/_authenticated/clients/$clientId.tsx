import { createFileRoute, notFound, redirect } from '@tanstack/react-router';
import { z } from 'zod';

import { getGetClientQueryKey, getGetClientQueryOptions } from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import {
  ClientError,
  ClientLayout,
  ClientNotFound,
  ClientPending,
} from '@/features/clients/client-layout';

// Row-level security hides other organizations' clients, so a 404 from the API is the
// not-found screen whether the client belongs to someone else or does not exist.
export const Route = createFileRoute('/_authenticated/clients/$clientId')({
  params: { parse: (params) => ({ clientId: z.uuid().parse(params.clientId) }) },
  loader: async ({ params, context: { apiRequest, queryClient, auth } }) => {
    const userId = auth.getSnapshot().session?.user.id;
    let client;
    try {
      ({ client } = await queryClient.ensureQueryData(
        getGetClientQueryOptions(params.clientId, {
          request: apiRequest,
          query: { queryKey: [...getGetClientQueryKey(params.clientId), userId] },
        })
      ));
    } catch (cause) {
      if (cause instanceof ApiHttpError && cause.status === 404) throw notFound();
      throw cause;
    }
    // A lead has its own page and none of these sections (ADR 007). Only an owner gets one.
    if (client.stage === 'lead') {
      throw redirect({ to: '/leads/$leadId', params: { leadId: client.id }, replace: true });
    }
    // The shell shows the crumb in place of a static title.
    return { client, crumb: client.legalName };
  },
  component: ClientLayout,
  pendingComponent: ClientPending,
  notFoundComponent: ClientNotFound,
  errorComponent: ClientError,
});
