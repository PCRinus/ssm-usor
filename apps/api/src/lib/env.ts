import type { CurrentUser } from '@ssm-usor/contracts';
import { z } from 'zod';

import type { Membership } from './membership';

export type ApiEnv = {
  Bindings: {
    SUPABASE_URL?: string;
    SUPABASE_PUBLISHABLE_KEY?: string;
    CORS_ORIGINS?: string;
  };
  Variables: { user: CurrentUser; accessToken: string; membership: Membership };
};

export const supabaseConfigSchema = z.object({
  SUPABASE_URL: z.url().pipe(
    z.string().refine((value) => {
      const url = new URL(value);
      return (
        url.protocol === 'https:' ||
        (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))
      );
    })
  ),
  SUPABASE_PUBLISHABLE_KEY: z.string().startsWith('sb_publishable_').min(16),
});

export function allowedOrigins(env: ApiEnv['Bindings']) {
  return (env.CORS_ORIGINS ?? 'https://app.ssmusor.ro')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}
