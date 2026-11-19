import { toast } from '@ssm-usor/ui/lib/toast';
import { useQueryClient } from '@tanstack/react-query';

import {
  getListReleasesQueryKey,
  getListReleasesQueryOptions,
  type ListReleasesQueryResult,
  type Release,
  useAcknowledgeReleases as useAcknowledgeReleasesMutation,
  useListReleases,
} from '@/api/generated/api';
import type { ApiRequestOptions } from '@/api/http';
import { useApi, withUserId } from '@/api/use-api';

const releasesStaleTime = 5 * 60_000;

export const releasesQueryKey = (userId: string | undefined) =>
  withUserId(userId)(getListReleasesQueryKey());

export const releasesQueryOptions = (request: ApiRequestOptions, userId: string | undefined) =>
  getListReleasesQueryOptions({
    request,
    query: { queryKey: releasesQueryKey(userId), staleTime: releasesStaleTime },
  });

export function useReleases() {
  const { request, ready, key } = useApi();
  const query = useListReleases({
    request,
    query: {
      queryKey: key(getListReleasesQueryKey()),
      staleTime: releasesStaleTime,
      enabled: ready,
    },
  });
  const releases: Release[] = query.data?.items ?? [];
  const unread = releases.filter((release) => release.unread);
  return {
    query,
    releases,
    newest: releases.at(0),
    unreadCount: unread.length,
    newestUnread: unread.at(0),
    find: (tag: string | undefined) => releases.find((release) => release.tag === tag),
    isUnread: (tag: string) => unread.some((release) => release.tag === tag),
  };
}

export function useAcknowledgeReleases() {
  const { request, key } = useApi();
  const queryClient = useQueryClient();
  const { newest, unreadCount, find } = useReleases();
  const queryKey = key(getListReleasesQueryKey());
  const mutation = useAcknowledgeReleasesMutation({ request });

  function acknowledge(tag = newest?.tag) {
    const through = find(tag);
    if (!through || unreadCount === 0) return;
    mutation.mutate(
      { data: { tag: through.tag } },
      {
        onSuccess: () => {
          queryClient.setQueryData<ListReleasesQueryResult>(queryKey, (list) =>
            list
              ? {
                  items: list.items.map((release) =>
                    release.publishedAt <= through.publishedAt
                      ? { ...release, unread: false }
                      : release
                  ),
                }
              : list
          );
          void queryClient.invalidateQueries({ queryKey });
        },
        onError: () => {
          toast.error('Nu am putut marca actualizările ca citite. Încearcă din nou.');
        },
      }
    );
  }

  return { acknowledge, pending: mutation.isPending };
}
