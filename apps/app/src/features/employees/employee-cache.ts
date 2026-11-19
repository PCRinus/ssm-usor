import type { QueryClient } from '@tanstack/react-query';

import {
  getGetClientQueryKey,
  getGetEmployeeQueryKey,
  getListEmployeesQueryKey,
  getListJobPositionsQueryKey,
  getListWorkplacesQueryKey,
} from '@/api/generated/api';
import { refreshEmployeesOverStep } from '@/features/subscription/employees-over-step';

/**
 * After a worker joins, changes or leaves the client's current workforce: their job position and
 * workplace count them, and so do the client's count of current workers and the plan's step.
 * Moving a worker between job positions changes neither the workplaces nor the client's count,
 * so it refreshes less.
 */
export function refreshWorkforce(
  queryClient: QueryClient,
  clientId: string,
  { employeeId }: { employeeId?: string } = {}
) {
  return Promise.all([
    // Every filtered variant of the client's list starts with the same key prefix.
    queryClient.invalidateQueries({ queryKey: getListEmployeesQueryKey(clientId) }),
    ...(employeeId
      ? [queryClient.invalidateQueries({ queryKey: getGetEmployeeQueryKey(clientId, employeeId) })]
      : []),
    refreshEmployeesOverStep(queryClient),
    queryClient.invalidateQueries({ queryKey: getListJobPositionsQueryKey(clientId) }),
    queryClient.invalidateQueries({ queryKey: getListWorkplacesQueryKey(clientId) }),
    queryClient.refetchQueries({ queryKey: getGetClientQueryKey(clientId) }),
  ]);
}
