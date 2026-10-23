import { toast } from '@ssm-usor/ui/lib/toast';
import { useQueryClient } from '@tanstack/react-query';
import { useRouteContext } from '@tanstack/react-router';

import {
  getListReleasesQueryKey,
  getListReleasesQueryOptions,
  type ListReleasesQueryResult,
  type Release,
  useAcknowledgeReleases as useAcknowledgeReleasesMutation,
  useListReleases,
} from '@/api/generated/api';
import type { ApiRequestOptions } from '@/api/http';
import { useAuth } from '@/features/auth/auth-context';

const releasesStaleTime = 5 * 60_000;

export const releasesQueryKey = (userId: string | undefined) => [
  ...getListReleasesQueryKey(),
  userId,
];

export const releasesQueryOptions = (request: ApiRequestOptions, userId: string | undefined) =>
  getListReleasesQueryOptions({
    request,
    query: { queryKey: releasesQueryKey(userId), staleTime: releasesStaleTime },
  });

export function useReleases() {
  const { session } = useAuth();
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const userId = session?.user.id;
  const query = useListReleases({
    request: apiRequest,
    query: {
      queryKey: releasesQueryKey(userId),
      staleTime: releasesStaleTime,
      enabled: Boolean(session && apiRequest.baseUrl),
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
  const { session } = useAuth();
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const queryClient = useQueryClient();
  const { newest, unreadCount, find } = useReleases();
  const queryKey = releasesQueryKey(session?.user.id);
  const mutation = useAcknowledgeReleasesMutation({ request: apiRequest });

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
