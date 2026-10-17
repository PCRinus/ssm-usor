import { useEffect, useState } from 'react';

export function useTimeReached(isoTimestamp: string) {
  const at = Date.parse(isoTimestamp);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setTimeout(() => setNow(Date.now()), Math.max(at - Date.now(), 0));
    return () => clearTimeout(timer);
  }, [at]);
  return now >= at;
}
