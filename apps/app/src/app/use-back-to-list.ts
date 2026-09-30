import { useLocation, useRouter } from '@tanstack/react-router';
import type { MouseEvent } from 'react';

// Following the link would add a history entry, which the router scrolls to the top; going
// back returns to the list where it was left. That is right only when the list is the
// previous entry, which the link that opened the editor records in its history state.
export function useBackToList() {
  const router = useRouter();
  const openedFromList = useLocation({
    select: (location) => location.state.openedFromList === true,
  });
  return (event: MouseEvent) => {
    if (!openedFromList || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    router.history.back();
  };
}
