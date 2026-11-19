import { createFileRoute, notFound } from '@tanstack/react-router';
import { z } from 'zod';

import { getGetLegalChangeQueryKey, getGetLegalChangeQueryOptions } from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { useAuth } from '@/features/auth/auth-context';
import {
  LegalChangeError,
  LegalChangeNotFound,
  LegalChangePage,
} from '@/features/legislation/legal-change-page';
import { LegalChangePending } from '@/features/legislation/legal-change-pending';

export const Route = createFileRoute('/_authenticated/legislatie_/modificari/$changeId')({
  params: { parse: (params) => ({ changeId: z.uuid().parse(params.changeId) }) },
  loader: async ({ params, context: { apiRequest, queryClient, auth } }) => {
    const userId = auth.getSnapshot().session?.user.id;
    try {
      const { change } = await queryClient.ensureQueryData(
        getGetLegalChangeQueryOptions(params.changeId, {
          request: apiRequest,
          query: { queryKey: [...getGetLegalChangeQueryKey(params.changeId), userId] },
        })
      );
      return { crumb: change.act.name };
    } catch (cause) {
      if (cause instanceof ApiHttpError && cause.status === 404) throw notFound();
      throw cause;
    }
  },
  component: LegalChangeRoute,
  pendingComponent: LegalChangePending,
  notFoundComponent: LegalChangeNotFound,
  errorComponent: LegalChangeError,
});

function LegalChangeRoute() {
  const { changeId } = Route.useParams();
  const { session } = useAuth();
  return <LegalChangePage changeId={changeId} userId={session?.user.id ?? ''} />;
}
