import { createContext, type RefObject, use, useCallback, useLayoutEffect, useRef } from 'react';

export const SavingContext = createContext<RefObject<boolean> | null>(null);

// Closing while a save runs would unmount the form, and with it the failure message it shows.
export function useCloseGuard(onClose: () => void) {
  const savingRef = useRef(false);
  const onOpenChange = useCallback(
    (next: boolean, details?: { cancel: () => void }) => {
      if (next) return;
      // A drawer swiped shut stays shut on screen unless the change itself is cancelled.
      if (savingRef.current) details?.cancel();
      else onClose();
    },
    [onClose]
  );
  return { savingRef, onOpenChange };
}

export function useHoldOpen(busy: boolean) {
  const savingRef = use(SavingContext);
  if (!savingRef) throw new Error('useHoldOpen needs a FormDialog or a CloseGuard around it.');
  useLayoutEffect(() => {
    savingRef.current = busy;
    return () => {
      savingRef.current = false;
    };
  }, [savingRef, busy]);
}
