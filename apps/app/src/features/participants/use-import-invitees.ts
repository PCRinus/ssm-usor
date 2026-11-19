import type { ImportInvitee } from '@ssm-usor/contracts';

import { useListImportPortalInvitees } from '@/api/generated/api';
import { useApi } from '@/api/use-api';

export function useImportInvitees(
  clientId: string,
  importId: string,
  { refetchOnMount, enabled = true }: { refetchOnMount?: 'always'; enabled?: boolean } = {}
) {
  const { request } = useApi();
  return useListImportPortalInvitees(clientId, importId, {
    request,
    query: { enabled, ...(refetchOnMount ? { refetchOnMount } : {}) },
  });
}

export function uninvitedOf(invitees: ImportInvitee[]) {
  return invitees.filter((invitee) => invitee.current && !invitee.portal).length;
}
