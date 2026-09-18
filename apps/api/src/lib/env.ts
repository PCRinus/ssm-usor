import type { CurrentUser, MailService } from '@ssm-usor/contracts';
import { z } from 'zod';

import type { Membership } from './membership';

export type ApiEnv = {
  Bindings: {
    SUPABASE_URL?: string;
    SUPABASE_PUBLISHABLE_KEY?: string;
    CORS_ORIGINS?: string;
    // Bypasses row-level security. Read it only through createAdminClient.
    SUPABASE_SECRET_KEY?: string;
    TURNSTILE_SECRET_KEY?: string;
    MARKETING_ORIGIN?: string;
    // Where this API is reachable from an email; the request URL is not reliable under wrangler dev.
    API_ORIGIN?: string;
    // Service binding to apps/mail.
    MAIL?: MailService;
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

export function marketingOrigin(env: ApiEnv['Bindings']) {
  return env.MARKETING_ORIGIN ?? 'https://ssmusor.ro';
}

export function apiOrigin(env: ApiEnv['Bindings']) {
  return env.API_ORIGIN ?? 'https://api.ssmusor.ro';
}
