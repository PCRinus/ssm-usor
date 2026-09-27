import { clientConflictReasons } from '@ssm-usor/contracts';
import { createClient } from '@supabase/supabase-js';
import type { Context } from 'hono';

import type { Database } from '../database.types';
import { type ApiEnv, supabaseConfigSchema } from './env';
import { ApiError } from './errors';

const slowRequestMs = 2_000;

// Slow requests are logged whether or not they succeed: an upstream that wakes slowly after a
// quiet spell shows here before its requests start to time out.
export function requestFetch(c: Context<ApiEnv>, timeoutMs: number): typeof fetch {
  return async (input, init) => {
    const started = Date.now();
    let outcome = 'no response';
    try {
      const response = await fetch(input, {
        ...init,
        signal: AbortSignal.any([c.req.raw.signal, AbortSignal.timeout(timeoutMs)]),
      });
      outcome = `status ${response.status}`;
      return response;
    } finally {
      const elapsed = Date.now() - started;
      if (elapsed >= slowRequestMs) {
        console.warn(`Slow upstream request: ${upstream(input)} took ${elapsed} ms (${outcome})`);
      }
    }
  };
}

// The service and the resource only: the ids, filters and signed tokens after them stay out.
function upstream(input: RequestInfo | URL) {
  const url = new URL(input instanceof Request ? input.url : String(input));
  return url.host + url.pathname.split('/').slice(0, 4).join('/');
}

export function supabaseConfig(c: Context<ApiEnv>) {
  const config = supabaseConfigSchema.safeParse(c.env);
  if (!config.success) throw new ApiError('service_unavailable');
  return config.data;
}

// Row-level security in the database is the authorization layer: this client acts with the
// caller's token, never the secret key.
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

// Raised by the triggers that keep everything under an archived client as it is.
const archivedClientCode = 'CLA01';

export const archivedClientError = () =>
  new ApiError(
    'conflict',
    'The client is archived; nothing under it changes until it is restored.',
    undefined,
    clientConflictReasons.clientArchived
  );

// Raised by the triggers that keep employees, positions, workplaces and documents off a lead.
const leadCode = 'CLL01';

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
    case archivedClientCode:
      return archivedClientError();
    case leadCode:
      return new ApiError(
        'conflict',
        'The company is still a lead; it has no safety records until it is promoted.',
        undefined,
        clientConflictReasons.clientIsLead
      );
  }
  // No code means the request never reached PostgREST (network, timeout, gateway). Only then
  // is the message logged: with a code it can quote the row's values.
  if (!error.code) {
    console.error(`Database request failed (${context}): no code: ${error.message ?? ''}`);
    return new ApiError('service_unavailable');
  }
  console.error(`Database request failed (${context}): ${error.code}`);
  return new ApiError('internal_error');
}
