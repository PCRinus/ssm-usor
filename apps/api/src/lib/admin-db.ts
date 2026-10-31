import { createClient } from '@supabase/supabase-js';
import type { Context } from 'hono';
import { z } from 'zod';

import type { Database } from '../database.types';
import { supabaseConfigOf, timedFetch } from './db';
import type { ApiEnv } from './env';
import { ApiError } from './errors';

const secretKeySchema = z.string().startsWith('sb_secret_').min(16);

// A client holding the secret key, which bypasses row-level security. It exists for
// work done on behalf of nobody signed in, for the signing flow's evidence and for the portal's
// reads (createPortalReadClient). Import it only in the modules that need it; everything else
// acting for a user goes through createDataClient.
export function createAdminClient(c: Context<ApiEnv>) {
  return adminClient(c.env, c.req.raw.signal, auditActorOf(c));
}

// For a write that must finish even when the caller disconnects, as the signing evidence must.
export function createLastingAdminClient(c: Context<ApiEnv>) {
  return adminClient(c.env, undefined, auditActorOf(c));
}

export function adminClient(env: ApiEnv['Bindings'], signal?: AbortSignal, actorId?: string) {
  const secretKey = secretKeySchema.safeParse(env.SUPABASE_SECRET_KEY);
  if (!secretKey.success) throw new ApiError('service_unavailable');

  return createClient<Database>(supabaseConfigOf(env).SUPABASE_URL, secretKey.data, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: timedFetch(8_000, signal),
      headers: actorId ? { [auditActorHeader]: actorId } : {},
    },
  });
}

export type AdminClient = ReturnType<typeof adminClient>;

// The audit log's triggers name this account as the one a secret-key write was for (ADR 033).
// They believe it only on a service-role request, which only the secret key can make.
export const auditActorHeader = 'x-audit-actor';

// The signed-in account, the platform admin during an impersonation: the database finds whom
// they impersonate itself. Unset before requireAuth, and for work no one signed in asked for.
function auditActorOf(c: Context<ApiEnv>): string | undefined {
  const user: ApiEnv['Variables']['user'] | undefined = c.get('user');
  return user?.id;
}
