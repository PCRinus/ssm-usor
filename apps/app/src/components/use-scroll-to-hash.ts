import { useLocation } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';

// The router scrolls to the hash as soon as the route renders, while the sections above the
// target may still be loading and growing. This scrolls again, once per navigation, when
// `ready` says the page has its final height.
export function useScrollToHash(ready: boolean) {
  const hash = useLocation({ select: (location) => location.hash });
  const navigation = useLocation({
    select: (location) => location.state.__TSR_key ?? location.href,
  });
  const scrolledFor = useRef<string | null>(null);

  useEffect(() => {
    if (!ready || !hash || scrolledFor.current === navigation) return;
    scrolledFor.current = navigation;
    document.getElementById(hash)?.scrollIntoView({ block: 'start' });
  }, [ready, hash, navigation]);
}
