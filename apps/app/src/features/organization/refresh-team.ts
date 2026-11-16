import type { QueryClient } from '@tanstack/react-query';

import {
  getGetBillingQueryKey,
  getGetOrganizationSeatsQueryKey,
  getListInvitationsQueryKey,
  getListOrganizationMembersQueryKey,
} from '@/api/generated/api';

// The billing overview is only marked stale: refetching it here would ask Stripe on every change,
// and the Abonament page reads it afresh when opened.
export const refreshTeam = (queryClient: QueryClient) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: getListOrganizationMembersQueryKey() }),
    queryClient.invalidateQueries({ queryKey: getListInvitationsQueryKey() }),
    queryClient.invalidateQueries({ queryKey: getGetOrganizationSeatsQueryKey() }),
    queryClient.invalidateQueries({ queryKey: getGetBillingQueryKey(), refetchType: 'none' }),
  ]);
