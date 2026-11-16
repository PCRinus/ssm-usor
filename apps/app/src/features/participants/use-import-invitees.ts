import type { ImportInvitee } from '@ssm-usor/contracts';
import { useRouteContext } from '@tanstack/react-router';

import { useListImportPortalInvitees } from '@/api/generated/api';

export function useImportInvitees(
  clientId: string,
  importId: string,
  { refetchOnMount, enabled = true }: { refetchOnMount?: 'always'; enabled?: boolean } = {}
) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  return useListImportPortalInvitees(clientId, importId, {
    request: apiRequest,
    query: { enabled, ...(refetchOnMount ? { refetchOnMount } : {}) },
  });
}

export function uninvitedOf(invitees: ImportInvitee[]) {
  return invitees.filter((invitee) => invitee.current && !invitee.portal).length;
}
