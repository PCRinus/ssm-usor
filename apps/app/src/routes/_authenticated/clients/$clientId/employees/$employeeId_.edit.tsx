import { createFileRoute, getRouteApi, notFound, useRouteContext } from '@tanstack/react-router';
import { z } from 'zod';

import {
  getGetEmployeeQueryKey,
  getGetEmployeeQueryOptions,
  useGetEmployee,
} from '../../../../../api/generated/api';
import { ApiHttpError } from '../../../../../api/http';
import { useAuth } from '../../../../../auth/auth-context';
import { EmployeeForm } from '../../../../../employees/employee-form';

// Correcting what was entered about an employee. The trailing underscore keeps this page out of
// the employee page's own layout; the loader warms the same query that page reads.
export const Route = createFileRoute(
  '/_authenticated/clients/$clientId/employees/$employeeId_/edit'
)({
  staticData: { title: 'Modifică angajatul', fullPage: true },
  params: { parse: (params) => ({ employeeId: z.uuid().parse(params.employeeId) }) },
  loader: async ({ params, context: { apiRequest, queryClient, auth } }) => {
    const userId = auth.getSnapshot().session?.user.id;
    try {
      await queryClient.ensureQueryData(
        getGetEmployeeQueryOptions(params.clientId, params.employeeId, {
          request: apiRequest,
          query: {
            queryKey: [...getGetEmployeeQueryKey(params.clientId, params.employeeId), userId],
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

const clientRoute = getRouteApi('/_authenticated/clients/$clientId');

export function EditEmployeePage() {
  const { clientId, employeeId } = Route.useParams();
  const { client } = clientRoute.useLoaderData();
  const { session } = useAuth();
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const query = useGetEmployee(clientId, employeeId, {
    request: apiRequest,
    query: {
      queryKey: [...getGetEmployeeQueryKey(clientId, employeeId), session?.user.id],
      enabled: Boolean(session && apiRequest.baseUrl),
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
    />
  );
}
