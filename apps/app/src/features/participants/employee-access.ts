import {
  type EmployeeParticipantState,
  getGetEmployeeParticipantQueryKey,
  useGetEmployeeParticipant,
} from '@/api/generated/api';
import { useApi } from '@/api/use-api';

import type { InvitedEmployee } from './invite-employee-dialog';

export function useEmployeeParticipant(clientId: string, employeeId: string) {
  const { request, ready, key } = useApi();
  return useGetEmployeeParticipant(clientId, employeeId, {
    request,
    query: {
      queryKey: key(getGetEmployeeParticipantQueryKey(clientId, employeeId)),
      enabled: ready,
    },
  });
}

export type AccessLead = 'invite' | 'contact' | 'resend';

export const hasContact = (employee: InvitedEmployee) => Boolean(employee.email || employee.phone);

// The access panel's forward step, which takes the tab's one dark button before the agreement's.
export function accessLead(
  state: EmployeeParticipantState,
  employee: InvitedEmployee,
  readOnly: boolean
): AccessLead | null {
  if (readOnly) return null;
  if (state.participant) return null;
  if (state.invitation) return state.invitation.status === 'expired' ? 'resend' : null;
  return hasContact(employee) ? 'invite' : 'contact';
}
