import { type QueryKey, useQuery } from '@tanstack/react-query';
import type { MouseEvent } from 'react';

import type { ApiRequestOptions } from '@/api/http';

export type FileLink = { url: string; fileName: string; expiresInSeconds: number };

export type Disposition = 'attachment' | 'inline';

// For a file in Storage: the API passes it through under its real name, which Storage's own
// header loses. `inline` shows a PDF in the browser's viewer, which the in-app browser of Gmail
// on Android (a Firefox custom tab) can do where it cannot download at all.
export function fileAddress(
  apiBaseUrl: string | undefined,
  link: { url: string; fileName: string },
  disposition: Disposition
) {
  if (!apiBaseUrl) throw new Error('The API URL is not configured.');
  const address = new URL('files/download', `${apiBaseUrl.replace(/\/$/, '')}/`);
  address.searchParams.set('source', link.url);
  address.searchParams.set('name', link.fileName);
  address.searchParams.set('disposition', disposition);
  return address.href;
}

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
