import type { QueryClient } from '@tanstack/react-query';

import { endMyImpersonation, type MeResponse } from '@/api/generated/api';
import type { ApiRequestOptions } from '@/api/http';
import { meQueryKey } from '@/features/account/use-me';

const patience = 3_000;

// Best effort: the sign-out neither fails nor waits long for it.
export async function endImpersonationBeforeSignOut(
  { queryClient, apiRequest }: { queryClient: QueryClient; apiRequest: ApiRequestOptions },
  userId: string | undefined
) {
  if (!queryClient.getQueryData<MeResponse>(meQueryKey(userId))?.impersonation) return;
  await endMyImpersonation({ ...apiRequest, signal: AbortSignal.timeout(patience) }).catch(
    () => undefined
  );
}
