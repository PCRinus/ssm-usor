import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { getGetImportQueryKey, getGetImportQueryOptions } from '@/api/generated/api';
import { EmployeeImportPersonPage } from '@/features/imports/employees/employee-import-page';
import { changesOf, personName } from '@/features/imports/employees/employee-review-model';

export const Route = createFileRoute(
  '/_authenticated/clients/$clientId/employees/import/$importId/$personId'
)({
  params: { parse: (params) => ({ personId: z.string().min(1).max(80).parse(params.personId) }) },
  loader: async ({ params, context: { apiRequest, queryClient, auth } }) => {
    const userId = auth.getSnapshot().session?.user.id;
    try {
      const { import: detail } = await queryClient.ensureQueryData(
        getGetImportQueryOptions(params.importId, {
          request: apiRequest,
          query: { queryKey: [...getGetImportQueryKey(params.importId), userId] },
        })
      );
      const review = detail.employees;
      const person = review?.proposal.people.find((each) => each.id === params.personId);
      if (!review || !person) return { crumb: 'Persoană' };
      return {
        crumb: personName(
          { proposal: review.proposal, changes: changesOf(review.changes) },
          person
        ),
      };
    } catch {
      return { crumb: 'Persoană' };
    }
  },
  component: PersonRoute,
});

function PersonRoute() {
  const { clientId, importId, personId } = Route.useParams();
  return <EmployeeImportPersonPage importId={importId} clientId={clientId} personId={personId} />;
}
