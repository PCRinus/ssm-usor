import { createClient } from '@supabase/supabase-js';
import type { Context } from 'hono';
import { z } from 'zod';

import type { Database } from '../database.types';
import { supabaseConfigOf, timedFetch } from './db';
import type { ApiEnv } from './env';
import { ApiError } from './errors';

const secretKeySchema = z.string().startsWith('sb_secret_').min(16);

// A client holding the secret key, which bypasses row-level security. It exists for
// work done on behalf of nobody signed in. Import it only in the modules that need it;
// everything acting for a user goes through createDataClient.
export function createAdminClient(c: Context<ApiEnv>) {
  return adminClient(c.env, c.req.raw.signal);
}

export function adminClient(env: ApiEnv['Bindings'], signal?: AbortSignal) {
  const secretKey = secretKeySchema.safeParse(env.SUPABASE_SECRET_KEY);
  if (!secretKey.success) throw new ApiError('service_unavailable');

  return createClient<Database>(supabaseConfigOf(env).SUPABASE_URL, secretKey.data, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: timedFetch(8_000, signal) },
  });
}

export type AdminClient = ReturnType<typeof adminClient>;
