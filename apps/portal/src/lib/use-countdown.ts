import { useEffect, useState } from 'react';

export function useCountdown(initialUntil = 0) {
  const [clock, setClock] = useState(() => ({ until: initialUntil, now: Date.now() }));
  useEffect(() => {
    if (clock.until === 0) return;
    const timer = window.setInterval(() => {
      const now = Date.now();
      setClock((current) => ({ ...current, now }));
      if (now >= clock.until) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [clock.until]);
  return {
    secondsLeft: Math.max(0, Math.ceil((clock.until - clock.now) / 1000)),
    restart(seconds: number) {
      const now = Date.now();
      setClock({ until: now + seconds * 1000, now });
    },
  };
}
