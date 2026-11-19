import { useCallback, useSyncExternalStore } from 'react';

const secondsUntil = (until: number | null) =>
  until === null ? 0 : Math.max(0, Math.ceil((until - Date.now()) / 1000));

// The clock is read at render, not kept in state, so a new `until` shows its full count at once.
export function useSecondsLeft(until: number | null, tickMs = 1_000) {
  const subscribe = useCallback(
    (onTick: () => void) => {
      if (secondsUntil(until) === 0) return () => {};
      const timer = setInterval(() => {
        onTick();
        if (secondsUntil(until) === 0) clearInterval(timer);
      }, tickMs);
      return () => clearInterval(timer);
    },
    [until, tickMs]
  );
  return useSyncExternalStore(subscribe, () => secondsUntil(until));
}
