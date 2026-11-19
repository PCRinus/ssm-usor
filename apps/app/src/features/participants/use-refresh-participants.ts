import {
  getGetEmployeeParticipantQueryKey,
  getListClientParticipantsQueryKey,
} from '@/api/generated/api';
import { useApi } from '@/api/use-api';

export function useRefreshParticipants(clientId: string) {
  const { queryClient } = useApi();
  return (employeeId: string | null) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: getListClientParticipantsQueryKey(clientId) }),
      queryClient.invalidateQueries({
        predicate: (query) =>
          typeof query.queryKey[0] === 'string' &&
          (query.queryKey[0] === `/clients/${clientId}/employees` ||
            query.queryKey[0] === `/clients/${clientId}/employee-invitees`),
      }),
      employeeId &&
        queryClient.invalidateQueries({
          queryKey: getGetEmployeeParticipantQueryKey(clientId, employeeId),
        }),
    ]);
}
