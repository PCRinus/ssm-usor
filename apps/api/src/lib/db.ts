import { createClient } from '@supabase/supabase-js';
import type { Context } from 'hono';

import type { Database } from '../database.types';
import { type ApiEnv, supabaseConfigSchema } from './env';
import { ApiError } from './errors';

// Bound the upstream call to the request lifetime and a fixed timeout.
export function requestFetch(c: Context<ApiEnv>, timeoutMs: number): typeof fetch {
  return (input, init) =>
    fetch(input, {
      ...init,
      signal: AbortSignal.any([c.req.raw.signal, AbortSignal.timeout(timeoutMs)]),
    });
}

export function supabaseConfig(c: Context<ApiEnv>) {
  const config = supabaseConfigSchema.safeParse(c.env);
  if (!config.success) throw new ApiError('service_unavailable');
  return config.data;
}

// A per-request PostgREST client acting as the verified user. Row-level security
// in the database is the authorization layer; the Worker holds no secret key.
export function createDataClient(c: Context<ApiEnv>) {
  const config = supabaseConfig(c);
  return createClient<Database>(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      headers: { Authorization: `Bearer ${c.get('accessToken')}` },
      fetch: requestFetch(c, 8_000),
    },
  });
}

export type DataClient = ReturnType<typeof createDataClient>;

interface PostgrestError {
  code?: string | null;
  message?: string;
}

// Translate PostgREST/Postgres failures into API errors without leaking details.
export function fromDatabaseError(error: PostgrestError, context: string): ApiError {
  switch (error.code) {
    case '23505':
      return new ApiError('conflict');
    case '23514':
    case '22P02':
      return new ApiError('validation_error');
    case '42501':
      return new ApiError('forbidden');
    case 'PGRST301':
      return new ApiError('unauthorized');
  }
  console.error(`Database request failed (${context}): ${error.code ?? 'no code'}`);
  // No code means the request never reached PostgREST (network, timeout, gateway).
  return new ApiError(error.code ? 'internal_error' : 'service_unavailable');
}
