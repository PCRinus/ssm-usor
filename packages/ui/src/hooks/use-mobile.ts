import { useSyncExternalStore } from 'react';

const MOBILE_QUERY = '(max-width: 767px)';
// Tailwind's `sm`, so the hook and `max-sm:` classes agree at fractional widths too.
const PHONE_QUERY = '(width < 40rem)';

const subscribeTo = (query: string) => (onChange: () => void) => {
  const media = window.matchMedia(query);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
};

const subscribeMobile = subscribeTo(MOBILE_QUERY);
const subscribePhone = subscribeTo(PHONE_QUERY);

export function useIsMobile() {
  return useSyncExternalStore(
    subscribeMobile,
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => false
  );
}

export function useIsPhone() {
  return useSyncExternalStore(
    subscribePhone,
    () => window.matchMedia(PHONE_QUERY).matches,
    () => false
  );
}
