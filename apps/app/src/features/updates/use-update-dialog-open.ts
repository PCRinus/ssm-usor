import { useLocation } from '@tanstack/react-router';

import { releaseTag } from '@/app/build-version';

import { useDismissedTag } from './dismissal';
import { useReleases } from './use-releases';

const tagPattern = /^(\d{4})\.(\d{2})\.(\d{2})(?:\.(\d+))?$/;

// The list cannot place the running build: a silent release has no row, and the running
// release's row is written only after its deployment succeeds (ADR 026). Tags are ordered by
// construction, the day then the same-day count, so they are compared as numbers.
function tagOrder(tag: string) {
  const match = tagPattern.exec(tag);
  if (!match) return undefined;
  const [, year, month, day, count = '1'] = match;
  return [year, month, day, count].map(Number);
}

export function runsRelease(runningTag: string | undefined, tag: string) {
  const running = runningTag ? tagOrder(runningTag) : undefined;
  const release = tagOrder(tag);
  if (!running || !release) return true;
  for (const [index, part] of running.entries()) {
    if (part !== release[index]) return part > (release[index] ?? 0);
  }
  return true;
}

export function useUpdateDialogOpen() {
  const { newestUnread } = useReleases();
  const dismissed = useDismissedTag();
  // A link to a release page lands on what the dialog would show, and that page acknowledges.
  const onUpdatesPage = useLocation({
    select: (location) =>
      location.pathname === '/actualizari' || location.pathname.startsWith('/actualizari/'),
  });
  return (
    newestUnread !== undefined &&
    newestUnread.tag !== dismissed &&
    runsRelease(releaseTag(), newestUnread.tag) &&
    !onUpdatesPage
  );
}
