import { useRouteContext } from '@tanstack/react-router';

import {
  getGetEmployeeParticipantQueryKey,
  getListClientParticipantsQueryKey,
} from '@/api/generated/api';

export function useRefreshParticipants(clientId: string) {
  const { queryClient } = useRouteContext({ from: '__root__' });
  return (employeeId: string | null) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: getListClientParticipantsQueryKey(clientId) }),
      employeeId &&
        queryClient.invalidateQueries({
          queryKey: getGetEmployeeParticipantQueryKey(clientId, employeeId),
        }),
    ]);
}
