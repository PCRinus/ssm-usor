import type {
  AdminActiveImpersonation,
  AdminImpersonation,
  AdminImpersonationList,
  AdminImpersonationStartRequest,
} from '@ssm-usor/contracts';
import { type QueryClient, useQuery } from '@tanstack/react-query';
import { useRouteContext } from '@tanstack/react-router';

import { apiFetch, type ApiRequestOptions } from '@/api/http';

export const activeImpersonationKey = ['admin', 'impersonation'] as const;
export const impersonationsKey = ['admin', 'impersonations'] as const;

export const impersonationsPageSize = 10;

export function useActiveImpersonation() {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  return useQuery({
    queryKey: activeImpersonationKey,
    queryFn: ({ signal }) =>
      apiFetch<AdminActiveImpersonation>('/api/impersonation', { ...apiRequest, signal }),
    select: (data) => data.impersonation,
    refetchOnWindowFocus: 'always',
  });
}

export const fetchImpersonations = (
  page: number,
  options: ApiRequestOptions & { signal?: AbortSignal }
) =>
  apiFetch<AdminImpersonationList>(
    `/api/impersonations?${new URLSearchParams({
      page: String(page),
      pageSize: String(impersonationsPageSize),
    })}`,
    options
  );

export const startImpersonation = (
  request: AdminImpersonationStartRequest,
  options: ApiRequestOptions
) =>
  apiFetch<AdminImpersonation>('/api/impersonation', {
    ...options,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

export const endImpersonation = (options: ApiRequestOptions) =>
  apiFetch<void>('/api/impersonation', { ...options, method: 'DELETE' });

export function refreshImpersonations(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: activeImpersonationKey }),
    queryClient.invalidateQueries({ queryKey: impersonationsKey }),
  ]);
}

export const targetName = (target: AdminImpersonation['target']) =>
  target.fullName ?? target.email ?? target.userId;
