import { useEffect, useState } from 'react';

// setTimeout fires at once for a delay past 2^31 - 1 ms (about 24.8 days), so a later moment is
// waited for in steps.
const maxDelay = 2 ** 31 - 1;

export function useTimeReached(isoTimestamp: string) {
  const at = Date.parse(isoTimestamp);
  const [now, setNow] = useState(() => Date.now());
  const reached = now >= at;
  useEffect(() => {
    if (reached) return;
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.min(Math.max(at - Date.now(), 0), maxDelay)
    );
    return () => clearTimeout(timer);
  }, [at, now, reached]);
  return reached;
}
