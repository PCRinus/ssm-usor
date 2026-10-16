import { useRouteContext } from '@tanstack/react-router';

import { useGetTrainingSheets } from '@/api/generated/api';

export function useTrainingSheets(clientId: string, employeeId: string) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  return useGetTrainingSheets(clientId, employeeId, { request: apiRequest });
}
