import {
  type AdminImportDetail,
  type AdminImportFileLink,
  type AdminImportList,
  adminImportStatusFilters,
  importKinds,
} from '@ssm-usor/contracts';

import { apiFetch, type ApiRequestOptions } from '@/api/http';

export interface ImportsSearch {
  page?: number;
  kind?: (typeof importKinds)[number];
  status?: (typeof adminImportStatusFilters)[number];
  reported?: boolean;
  hasCopy?: boolean;
}

const oneOf = <T extends string>(values: readonly T[], value: unknown): T | undefined =>
  typeof value === 'string' && (values as readonly string[]).includes(value)
    ? (value as T)
    : undefined;

const flag = (value: unknown) => (value === true || value === 'true' ? true : undefined);

export function importsSearchOf(search: Record<string, unknown>): ImportsSearch {
  const page = Number(search.page);
  return {
    page: Number.isInteger(page) && page > 1 ? page : undefined,
    kind: oneOf(importKinds, search.kind),
    status: oneOf(adminImportStatusFilters, search.status),
    reported: flag(search.reported),
    hasCopy: flag(search.hasCopy),
  };
}

export const importsPageSize = 25;

export function fetchImports(
  search: ImportsSearch,
  options: ApiRequestOptions & { signal?: AbortSignal }
) {
  const query = new URLSearchParams({
    page: String(search.page ?? 1),
    pageSize: String(importsPageSize),
  });
  if (search.kind) query.set('kind', search.kind);
  if (search.status) query.set('status', search.status);
  if (search.reported) query.set('reported', 'true');
  if (search.hasCopy) query.set('hasCopy', 'true');
  return apiFetch<AdminImportList>(`/api/imports?${query}`, options);
}

export const fetchImport = (id: string, options: ApiRequestOptions & { signal?: AbortSignal }) =>
  apiFetch<AdminImportDetail>(`/api/imports/${encodeURIComponent(id)}`, options);

export const fetchFileLink = (id: string, path: string, options: ApiRequestOptions) =>
  apiFetch<AdminImportFileLink>(
    `/api/imports/${encodeURIComponent(id)}/files?${new URLSearchParams({ path })}`,
    options
  );
