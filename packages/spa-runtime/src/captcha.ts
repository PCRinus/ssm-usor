import { useTurnstile } from '@ssm-usor/ui/hooks/use-turnstile';

// Cloudflare's test key, which always passes; the local stack has the matching test secret
// (supabase/config.toml).
const testSiteKey = '1x00000000000000000000AA';

const siteKey =
  import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim() ||
  (import.meta.env.DEV ? testSiteKey : undefined);

export const useCaptcha = () => useTurnstile(siteKey);
