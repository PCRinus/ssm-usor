import { useRouter } from '@tanstack/react-router';
import type { MouseEvent } from 'react';

import { stepsBackToOpener } from './opener';

// With `record`, only when the page was opened from that record (`openedFromRecord`).
export function useReturnToOpener(record?: string) {
  const router = useRouter();
  return () => {
    const steps = stepsBackToOpener(router.history.location.state, record);
    if (steps === null) return false;
    router.history.go(steps);
    return true;
  };
}

// For a link back to where the page was opened from: a plain click goes back to that entry
// instead of adding one, so it keeps its filters and its own opener.
export function useReturnOnClick(record?: string) {
  const returnToOpener = useReturnToOpener(record);
  return (event: MouseEvent) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    if (returnToOpener()) event.preventDefault();
  };
}
