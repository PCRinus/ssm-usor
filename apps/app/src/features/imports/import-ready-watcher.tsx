import { toast } from '@ssm-usor/ui/lib/toast';
import { useNavigate, useParams, useRouteContext } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';

import { getListImportsQueryKey, useListImports } from '@/api/generated/api';
import { useAuth } from '@/features/auth/auth-context';

import { importListPollMs } from './import-format';
import { importReadyNotices, isMineRunning } from './import-ready-notices';

const announcedKey = (importId: string) => `ssm-usor:import-announced:${importId}`;

// Shared by the member's tabs, so a second tab or a reload does not announce the import again.
// Storage throws in some private windows; this tab still announces each import once.
function wasAnnounced(importId: string) {
  try {
    return localStorage.getItem(announcedKey(importId)) !== null;
  } catch {
    return false;
  }
}

function markAnnounced(importId: string) {
  try {
    localStorage.setItem(announcedKey(importId), new Date().toISOString());
  } catch {
    return;
  }
}

const toastId = (importId: string) => `import-ready:${importId}`;

const params = { kind: 'all' } as const;

export function ImportReadyWatcher() {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const { session } = useAuth();
  const userId = session?.user.id;
  const navigate = useNavigate();
  const watching = useParams({ strict: false, select: (each) => each.importId ?? null });
  const imports = useListImports(params, {
    request: apiRequest,
    query: {
      queryKey: [...getListImportsQueryKey(params), userId],
      enabled: Boolean(userId && apiRequest.baseUrl),
      refetchOnWindowFocus: 'always',
      refetchInterval: (query) =>
        userId && isMineRunning(query.state.data?.items ?? [], userId) ? importListPollMs : false,
    },
  });
  const seen = useRef(new Map<string, string>());

  useEffect(() => {
    const items = imports.data?.items;
    if (!items || !userId) return;
    const { shown, quiet } = importReadyNotices({
      previous: seen.current,
      items,
      userId,
      watching,
      announced: wasAnnounced,
    });
    seen.current = new Map(items.map((item) => [item.id, item.status]));
    quiet.forEach(markAnnounced);
    for (const notice of shown) {
      markAnnounced(notice.importId);
      const show = notice.tone === 'error' ? toast.error : toast.success;
      show(notice.title, {
        id: toastId(notice.importId),
        description: notice.description ?? undefined,
        duration: Infinity,
        action: { label: notice.action, onClick: () => void navigate(notice.link) },
      });
    }
  }, [imports.data, userId, watching, navigate]);

  useEffect(() => {
    if (watching) toast.dismiss(toastId(watching));
  }, [watching]);

  return null;
}
