import { type QueryKey, useQuery } from '@tanstack/react-query';
import type { MouseEvent } from 'react';

import type { ApiRequestOptions } from '@/api/http';

import { fileAddress } from './save-file';

export type FileLink = { url: string; fileName: string; expiresInSeconds: number };

export type Disposition = 'attachment' | 'inline';

// Shown inline, a file takes a tab of its own, so the page stays where it was; an attachment
// downloads without leaving the page, and a `_blank` would leave an empty tab behind.
export const linkTarget = (disposition: Disposition) =>
  disposition === 'inline' ? '_blank' : undefined;

export function openAddress(address: string, disposition: Disposition) {
  if (disposition === 'inline' && window.open(address, '_blank')) return;
  window.location.assign(address);
}

export const renewalMs = (expiresInSeconds = 600) => Math.max(expiresInSeconds - 60, 30) * 1_000;

/**
 * A signed link kept ready on a real anchor, renewed before it expires. A real link is what the
 * in-app browser of a mail client can open: it cannot download, and shows a blob URL blank.
 */
export function useFileLink({
  queryKey,
  load,
  enabled = true,
  apiRequest,
  disposition,
}: {
  queryKey: QueryKey;
  load: (signal: AbortSignal) => Promise<FileLink>;
  enabled?: boolean;
  apiRequest: ApiRequestOptions;
  disposition: Disposition;
}) {
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => load(signal),
    enabled: enabled && Boolean(apiRequest.baseUrl),
    retry: false,
    staleTime: (current) => renewalMs(current.state.data?.expiresInSeconds),
    refetchInterval: (current) => renewalMs(current.state.data?.expiresInSeconds),
  });
  const href =
    query.data && apiRequest.baseUrl
      ? fileAddress(apiRequest.baseUrl, query.data, disposition)
      : undefined;

  // A phone that slept may keep a link past its expiry before the renewal runs.
  async function onClick(event: MouseEvent<HTMLAnchorElement>) {
    if (!query.data) return;
    const lifetime = query.data.expiresInSeconds * 1_000;
    if (Date.now() - query.dataUpdatedAt < lifetime - 30_000) return;
    event.preventDefault();
    const { data } = await query.refetch();
    if (data) openAddress(fileAddress(apiRequest.baseUrl, data, disposition), disposition);
  }

  return {
    href,
    target: linkTarget(disposition),
    onClick,
    pending: query.isPending && query.fetchStatus !== 'idle',
    error: query.error,
    refetch: query.refetch,
  };
}
