import {
  type AdminLegalAct,
  type AdminLegalActList,
  type AdminLegalChangeDetail,
  type AdminLegalChangeList,
  adminLegalChangeOutcomeFilters,
  adminLegalChangeStatusFilters,
  type AdminLegalCheckRunList,
} from '@ssm-usor/contracts';
import type { QueryClient } from '@tanstack/react-query';

import { apiFetch, type ApiRequestOptions } from '@/api/http';

type Read = ApiRequestOptions & { signal?: AbortSignal };

const oneOf = <T extends string>(values: readonly T[], value: unknown): T | undefined =>
  typeof value === 'string' && (values as readonly string[]).includes(value)
    ? (value as T)
    : undefined;

export interface ChangesSearch {
  status?: (typeof adminLegalChangeStatusFilters)[number];
  outcome?: (typeof adminLegalChangeOutcomeFilters)[number];
}

export const changesSearchOf = (search: Record<string, unknown>): ChangesSearch => ({
  status: oneOf(adminLegalChangeStatusFilters, search.status),
  outcome: oneOf(adminLegalChangeOutcomeFilters, search.outcome),
});

export const actSortKeys = ['name', 'status', 'seen', 'verified', 'checked', 'byHand'] as const;
export type ActSortKey = (typeof actSortKeys)[number];

export interface ActsSearch {
  sort?: ActSortKey;
  order?: 'asc' | 'desc';
}

export const actsSearchOf = (search: Record<string, unknown>): ActsSearch => ({
  sort: oneOf(actSortKeys, search.sort),
  order: oneOf(['asc', 'desc'] as const, search.order),
});

export interface RunsSearch {
  page?: number;
}

export function runsSearchOf(search: Record<string, unknown>): RunsSearch {
  const page = Number(search.page);
  return { page: Number.isInteger(page) && page > 1 ? page : undefined };
}

export const runsPageSize = 25;

export const legislationKey = ['admin', 'legislation'] as const;

export function fetchChanges(search: ChangesSearch, options: Read) {
  const query = new URLSearchParams();
  if (search.status) query.set('status', search.status);
  if (search.outcome) query.set('outcome', search.outcome);
  const suffix = query.size > 0 ? `?${query}` : '';
  return apiFetch<AdminLegalChangeList>(`/api/legislation/changes${suffix}`, options);
}

export const changePath = (id: string) => `/api/legislation/changes/${encodeURIComponent(id)}`;

export const fetchChange = (id: string, options: Read) =>
  apiFetch<AdminLegalChangeDetail>(changePath(id), options);

export const fetchActs = (options: Read) =>
  apiFetch<AdminLegalActList>('/api/legislation/acts', options);

export const fetchRuns = (search: RunsSearch, options: Read) =>
  apiFetch<AdminLegalCheckRunList>(
    `/api/legislation/runs?${new URLSearchParams({
      page: String(search.page ?? 1),
      pageSize: String(runsPageSize),
    })}`,
    options
  );

const json = (method: 'POST' | 'PUT', body: unknown) => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const resolveNoImpact = (id: string, note: string, options: ApiRequestOptions) =>
  apiFetch<AdminLegalChangeDetail>(`${changePath(id)}/no-impact`, {
    ...options,
    ...json('POST', { note }),
  });

export const linkTemplateVersion = (
  id: string,
  templateVersionId: string,
  options: ApiRequestOptions
) =>
  apiFetch<AdminLegalChangeDetail>(`${changePath(id)}/template-version`, {
    ...options,
    ...json('POST', { templateVersionId }),
  });

export const recordVerifiedForm = (
  actId: string,
  consolidatedOn: string,
  options: ApiRequestOptions
) =>
  apiFetch<AdminLegalAct>(`/api/legislation/acts/${encodeURIComponent(actId)}/verified-form`, {
    ...options,
    ...json('PUT', { consolidatedOn }),
  });

export function refreshLegislation(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: legislationKey });
}
