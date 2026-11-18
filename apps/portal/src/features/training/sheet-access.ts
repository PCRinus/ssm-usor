import { useQueryClient } from '@tanstack/react-query';

import {
  getGetPortalEmployeeTrainingSheetsQueryKey,
  getGetPortalTrainingSheetsQueryKey,
  getPortalEmployeeTrainingSheet,
  getPortalEmployeeTrainingSheetLink,
  getPortalTrainingSheet,
  getPortalTrainingSheetLink,
  useGetPortalEmployeeTrainingSheets,
  useGetPortalTrainingSheets,
} from '@/api/generated/api';
import { useApiRequest } from '@/lib/request';

import type { SheetAccess } from './use-sheet-actions';

export function useOwnSheetAccess(participantId: string) {
  const apiRequest = useApiRequest();
  const queryClient = useQueryClient();
  const sheets = useGetPortalTrainingSheets(participantId, { request: apiRequest });
  const access: SheetAccess = {
    sheets: sheets.data,
    loadSheet: (domain, sequence) =>
      getPortalTrainingSheet(
        participantId,
        domain,
        sequence ? { sequence } : undefined,
        apiRequest
      ),
    loadLink: (domain, sequence, signal) =>
      getPortalTrainingSheetLink(participantId, domain, { sequence }, { ...apiRequest, signal }),
    linkScope: [participantId],
    onStale: () =>
      void queryClient.invalidateQueries({
        queryKey: getGetPortalTrainingSheetsQueryKey(participantId),
      }),
  };
  return { access, failed: sheets.isError };
}

export function useEmployeeSheetAccess(participantId: string, employeeId: string) {
  const apiRequest = useApiRequest();
  const queryClient = useQueryClient();
  const sheets = useGetPortalEmployeeTrainingSheets(participantId, employeeId, {
    request: apiRequest,
  });
  const access: SheetAccess = {
    sheets: sheets.data,
    loadSheet: (domain, sequence) =>
      getPortalEmployeeTrainingSheet(
        participantId,
        employeeId,
        domain,
        sequence ? { sequence } : undefined,
        apiRequest
      ),
    loadLink: (domain, sequence, signal) =>
      getPortalEmployeeTrainingSheetLink(
        participantId,
        employeeId,
        domain,
        { sequence },
        { ...apiRequest, signal }
      ),
    linkScope: [participantId, employeeId],
    onStale: () =>
      void queryClient.invalidateQueries({
        queryKey: getGetPortalEmployeeTrainingSheetsQueryKey(participantId, employeeId),
      }),
  };
  return { access, failed: sheets.isError };
}
