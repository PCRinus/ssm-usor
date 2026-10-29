import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { useRouteContext } from '@tanstack/react-router';
import { createContext, useCallback, useRef } from 'react';

import {
  getGetImportSourceQueryKey,
  getGetImportSourceQueryOptions,
  type GetImportSourceParams,
  type ImportSourceResponse,
} from '@/api/generated/api';
import type { ApiRequestOptions } from '@/api/http';

import type { LabelledSource } from './review-model';
import { requestKind, type SourceKind } from './source-match';

export const viewerChunks = {
  word: () => import('./source-word-view'),
  pdf: () => import('./source-pdf-view'),
};

const viewerChunkOf: Partial<Record<SourceKind, () => Promise<unknown>>> = {
  word: viewerChunks.word,
  pdf: viewerChunks.pdf,
  scan: viewerChunks.pdf,
};

export function sourceParams(source: LabelledSource): GetImportSourceParams {
  return {
    file: source.file,
    quote: source.quote.slice(0, 2000),
    ...(source.near && { near: source.near.slice(0, 200) }),
  };
}

// A minute short of the links' expiry leaves the viewer time to open a link it was handed.
const linkLife = (answer: ImportSourceResponse | undefined) =>
  answer ? Math.max(0, (answer.expiresInSeconds - 60) * 1000) : 4 * 60_000;

export function sourceQuery(
  importId: string,
  params: GetImportSourceParams,
  apiRequest: ApiRequestOptions,
  queryClient: QueryClient
) {
  const queryKey = getGetImportSourceQueryKey(importId, params);
  return getGetImportSourceQueryOptions(importId, params, {
    request: apiRequest,
    query: {
      queryKey,
      staleTime: (cached) => linkLife(cached.state.data),
      // The cache keeps the longest time it was given, so the fallback stays the floor.
      gcTime: linkLife(queryClient.getQueryData<ImportSourceResponse>(queryKey)),
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  });
}

export const SourcePrefetchContext = createContext<((source: LabelledSource) => void) | null>(null);

// A pointer crossing a row of buttons back and forth would otherwise ask again each time an
// answer failed.
const prefetchAgainAfterMs = 5000;

export function useSourcePrefetch(importId: string) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const queryClient = useQueryClient();
  const asked = useRef(new Map<string, number>());
  return useCallback(
    (source: LabelledSource) => {
      const params = sourceParams(source);
      const key = JSON.stringify(params);
      const now = Date.now();
      if (now - (asked.current.get(key) ?? -Infinity) < prefetchAgainAfterMs) return;
      asked.current.set(key, now);
      void queryClient.prefetchQuery(sourceQuery(importId, params, apiRequest, queryClient));
      const kind = requestKind(source.file);
      if (kind) void viewerChunkOf[kind]?.();
    },
    [importId, apiRequest, queryClient]
  );
}
