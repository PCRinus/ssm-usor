import type {
  CurrentUser,
  MailService,
  PdfService,
  SignerService,
  SmsService,
} from '@ssm-usor/contracts';
import { z } from 'zod';

import { ApiError } from './errors';
import type { Membership } from './membership';
import type { Participation } from './participant';

export type RegenerationMessage = { jobId: string; clientId: string };

// Not the Workers `Queue` type: the Node scripts that import this file do not know it.
export type RegenerationQueue = {
  sendBatch(messages: Iterable<{ body: RegenerationMessage }>): Promise<unknown>;
};

export type ApiEnv = {
  Bindings: {
    SUPABASE_URL?: string;
    SUPABASE_PUBLISHABLE_KEY?: string;
    CORS_ORIGINS?: string;
    // Bypasses row-level security. Read it only through createAdminClient.
    SUPABASE_SECRET_KEY?: string;
    TURNSTILE_SECRET_KEY?: string;
    // Signs Supabase Auth's hook calls: "v1,whsec_<base64>", the same value Supabase holds.
    SUPABASE_AUTH_HOOK_SECRET?: string;
    // The same for its Send SMS hook, a secret of its own.
    SUPABASE_AUTH_SMS_HOOK_SECRET?: string;
    // Used only by the API to sign verified PostHog Support identities.
    POSTHOG_SUPPORT_SECRET_KEY?: string;
    MARKETING_ORIGIN?: string;
    // Where the SPA lives, for links in emails.
    APP_ORIGIN?: string;
    // Where the participants' portal lives, for the invitation messages.
    PORTAL_ORIGIN?: string;
    // Where this API is reachable from an email; the request URL is not reliable under wrangler dev.
    API_ORIGIN?: string;
    MAIL?: MailService;
    SMS?: SmsService;
    PDF?: PdfService;
    // "service" where apps/pdf is deployed and the binding above is to be used.
    PDF_CONVERSION?: string;
    // A Gotenberg reached by URL instead, for local development and the flow tests.
    GOTENBERG_URL?: string;
    // apps/pdf again, typed for signing (ADR 023); used under the same PDF_CONVERSION switch.
    SIGNER?: SignerService;
    // A signer container reached by URL instead, for local development.
    SIGNER_URL?: string;
    // The app's certificate authority (ADR 023): its P-256 key as PKCS#8 PEM, its certificate
    // as PEM, and the AES-256 key, base64, under which signers' private keys are stored.
    // `pnpm --filter @ssm-usor/api signing:ca` makes all three.
    SIGNING_CA_KEY?: string;
    SIGNING_CA_CERT?: string;
    SIGNING_KEY_ENCRYPTION_KEY?: string;
    // Bulk regeneration (ADR 017), consumed by this same Worker.
    REGENERATION_QUEUE?: RegenerationQueue;
    // Billing (ADR 029): a Stripe sandbox key on non-prod, a live restricted key in production.
    STRIPE_SECRET_KEY?: string;
    // "whsec_…", shown by Stripe only when the webhook endpoint is created.
    STRIPE_WEBHOOK_SECRET?: string;
    // Oblio's API login: the account's email, and the API secret that changes with its password.
    OBLIO_CLIENT_ID?: string;
    OBLIO_CLIENT_SECRET?: string;
    // Anything but "invoice" issues proformas, since Oblio has no test mode (ADR 029).
    OBLIO_DOCUMENTS?: string;
  };
  Variables: {
    user: CurrentUser;
    emailConfirmed: boolean;
    accessToken: string;
    membership: Membership;
    participations: Participation[];
    readOnlyAllowed: boolean;
  };
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

type OriginName =
  'CORS_ORIGINS' | 'MARKETING_ORIGIN' | 'APP_ORIGIN' | 'PORTAL_ORIGIN' | 'API_ORIGIN';

// No default: a production address would send a non-production user to production (ADR 025).
function requiredOrigin(env: ApiEnv['Bindings'], name: OriginName) {
  const value = env[name]?.trim();
  if (value) return value;
  console.error(`${name} is not set.`);
  throw new ApiError('service_unavailable');
}

export function allowedOrigins(env: ApiEnv['Bindings']) {
  return requiredOrigin(env, 'CORS_ORIGINS')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function marketingOrigin(env: ApiEnv['Bindings']) {
  return requiredOrigin(env, 'MARKETING_ORIGIN');
}

export function appOrigin(env: ApiEnv['Bindings']) {
  return requiredOrigin(env, 'APP_ORIGIN');
}

export function portalOrigin(env: ApiEnv['Bindings']) {
  return requiredOrigin(env, 'PORTAL_ORIGIN');
}

export function apiOrigin(env: ApiEnv['Bindings']) {
  return requiredOrigin(env, 'API_ORIGIN');
}
