import { useQuery } from '@tanstack/react-query';
import { useRouteContext } from '@tanstack/react-router';

import { apiFetch } from '@/api/http';

export type LatestCheckRun = {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  status: 'running' | 'succeeded' | 'failed';
  actsChecked: number;
  changesFound: number;
  actsSkipped: number;
  errors: { actId: string; message: string }[] | null;
};

const latestCheckRunPath = '/legislation/runs/latest';

// The route is not in the OpenAPI document yet; the generated client's hook replaces this one.
export function useLatestCheckRun(userId: string) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  return useQuery({
    queryKey: [latestCheckRunPath, userId],
    queryFn: ({ signal }) =>
      apiFetch<LatestCheckRun | null>(latestCheckRunPath, { ...apiRequest, signal, method: 'GET' }),
  });
}
