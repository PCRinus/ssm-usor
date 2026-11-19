import { createFileRoute, getRouteApi, notFound } from '@tanstack/react-router';
import { z } from 'zod';

import {
  getGetEmployeeQueryKey,
  getGetEmployeeQueryOptions,
  useGetEmployee,
} from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { useApi, withUserId } from '@/api/use-api';
import { EmployeeForm } from '@/features/employees/employee-form';
import { employeeFocus, focusSearch } from '@/features/missing-data/focus';

// Correcting what was entered about an employee. The trailing underscore keeps this page out of
// the employee page's own layout; the loader warms the same query that page reads.
export const Route = createFileRoute(
  '/_authenticated/clienti/$clientId/angajati/$employeeId_/editare'
)({
  staticData: { title: 'Modifică lucrătorul', fullPage: true },
  params: { parse: (params) => ({ employeeId: z.uuid().parse(params.employeeId) }) },
  validateSearch: focusSearch(employeeFocus),
  loader: async ({ params, context: { apiRequest, queryClient, auth } }) => {
    const key = withUserId(auth.getSnapshot().session?.user.id);
    try {
      await queryClient.ensureQueryData(
        getGetEmployeeQueryOptions(params.clientId, params.employeeId, {
          request: apiRequest,
          query: {
            queryKey: key(getGetEmployeeQueryKey(params.clientId, params.employeeId)),
          },
        })
      );
    } catch (cause) {
      if (cause instanceof ApiHttpError && cause.status === 404) throw notFound();
      throw cause;
    }
  },
  component: EditEmployeePage,
});

const clientRoute = getRouteApi('/_authenticated/clienti/$clientId');

function EditEmployeePage() {
  const { clientId, employeeId } = Route.useParams();
  const { focus } = Route.useSearch();
  const { client } = clientRoute.useLoaderData();
  const { request, ready, key } = useApi();
  const query = useGetEmployee(clientId, employeeId, {
    request,
    query: {
      queryKey: key(getGetEmployeeQueryKey(clientId, employeeId)),
      enabled: ready,
    },
  });
  const employee = query.data?.employee;
  if (!employee) return null;
  // Keyed, so that the form starts again from the record if another one is opened.
  return (
    <EmployeeForm
      key={employee.id}
      clientId={clientId}
      clientName={client.legalName}
      employee={employee}
      focus={focus}
    />
  );
}
