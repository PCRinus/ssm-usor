import { useLocation } from '@tanstack/react-router';

import { useDismissedTag } from './dismissal';
import { useReleases } from './use-releases';

export function useUpdateDialogOpen() {
  const { newestUnread } = useReleases();
  const dismissed = useDismissedTag();
  // A link to a release page lands on what the dialog would show, and that page acknowledges.
  const onUpdatesPage = useLocation({
    select: (location) =>
      location.pathname === '/actualizari' || location.pathname.startsWith('/actualizari/'),
  });
  return Boolean(newestUnread) && newestUnread?.tag !== dismissed && !onUpdatesPage;
}
