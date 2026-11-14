import { maxPageSize } from '@ssm-usor/contracts';
import { type QueryClient, useQuery } from '@tanstack/react-query';
import { useRouteContext } from '@tanstack/react-router';

import {
  type EmployeeListResponse,
  getGetEarlierInstructionsQueryKey,
  getListEmployeesQueryKey,
  getListOrganizationEmployeesQueryKey,
  getListSupplementaryTrainingProposalsQueryKey,
  getListTrainingsQueryKey,
  listEmployees,
} from '@/api/generated/api';
import { invalidateSignatures } from '@/features/signatures/signature-queries';

export type CurrentEmployee = EmployeeListResponse['items'][number];

// A training changes the trainings held, every attendee's records and signature requests, their
// training state on the employee page, both employee lists that show that state, and the posts a
// proposed supplementary training still waits for.
export function invalidateTrainings(queryClient: QueryClient, clientId: string) {
  const employeesPrefix = getListEmployeesQueryKey(clientId)[0];
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: getListTrainingsQueryKey(clientId) }),
    queryClient.invalidateQueries({
      predicate: ({ queryKey: [key] }) =>
        typeof key === 'string' &&
        (key === employeesPrefix || key.startsWith(`${employeesPrefix}/`)),
    }),
    queryClient.invalidateQueries({ queryKey: getListOrganizationEmployeesQueryKey() }),
    queryClient.invalidateQueries({
      queryKey: getListSupplementaryTrainingProposalsQueryKey(clientId),
    }),
    queryClient.invalidateQueries({ queryKey: getGetEarlierInstructionsQueryKey(clientId) }),
    invalidateSignatures(queryClient, clientId),
  ]);
}

const pageParams = (page: number) =>
  ({ page, pageSize: maxPageSize, sort: 'name', order: 'asc' }) as const;

// Page after page: a training may gather more people than one page holds.
export function useCurrentEmployees(clientId: string, userId: string) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  return useQuery({
    queryKey: [...getListEmployeesQueryKey(clientId), 'every-current', userId],
    enabled: Boolean(userId && apiRequest.baseUrl),
    queryFn: async ({ signal }) => {
      const items: CurrentEmployee[] = [];
      for (let page = 1; ; page += 1) {
        const response = await listEmployees(clientId, pageParams(page), {
          ...apiRequest,
          signal,
        });
        items.push(...response.items);
        if (response.items.length === 0 || items.length >= response.total) return items;
      }
    },
  });
}
