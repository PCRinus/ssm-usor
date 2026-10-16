import { formatEmployeeName } from '@ssm-usor/contracts';
import { createFileRoute, notFound } from '@tanstack/react-router';
import { z } from 'zod';

import { getGetEmployeeQueryKey, getGetEmployeeQueryOptions } from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import {
  EmployeeError,
  EmployeeLayout,
  EmployeeNotFound,
} from '@/features/employees/employee-layout';
import { EmployeePending } from '@/features/employees/employee-pending';

// The loader warms the query and names the breadcrumb; the tabs read the same query so a status
// change or a training refreshes them.
export const Route = createFileRoute('/_authenticated/clients/$clientId/employees/$employeeId')({
  staticData: { fullPage: true },
  // The client layout already validates clientId; this route owns employeeId.
  params: { parse: (params) => ({ employeeId: z.uuid().parse(params.employeeId) }) },
  loader: async ({ params, context: { apiRequest, queryClient, auth } }) => {
    const userId = auth.getSnapshot().session?.user.id;
    try {
      const { employee } = await queryClient.ensureQueryData(
        getGetEmployeeQueryOptions(params.clientId, params.employeeId, {
          request: apiRequest,
          query: {
            queryKey: [...getGetEmployeeQueryKey(params.clientId, params.employeeId), userId],
          },
        })
      );
      return { crumb: formatEmployeeName(employee) };
    } catch (cause) {
      if (cause instanceof ApiHttpError && cause.status === 404) throw notFound();
      throw cause;
    }
  },
  component: EmployeeLayout,
  pendingComponent: EmployeePending,
  notFoundComponent: EmployeeNotFound,
  errorComponent: EmployeeError,
});
