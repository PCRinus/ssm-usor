import { clientConflictReasons } from '@ssm-usor/contracts';
import { createClient } from '@supabase/supabase-js';
import type { Context } from 'hono';

import type { Database } from '../database.types';
import { type ApiEnv, supabaseConfigSchema } from './env';
import { ApiError } from './errors';

const slowRequestMs = 2_000;

export function requestFetch(c: Context<ApiEnv>, timeoutMs: number): typeof fetch {
  return timedFetch(timeoutMs, c.req.raw.signal);
}

// Slow requests are logged whether or not they succeed: an upstream that wakes slowly after a
// quiet spell shows here before its requests start to time out.
export function timedFetch(timeoutMs: number, signal?: AbortSignal): typeof fetch {
  return async (input, init) => {
    const started = Date.now();
    let outcome = 'no response';
    try {
      const timeout = AbortSignal.timeout(timeoutMs);
      const response = await fetch(input, {
        ...init,
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
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
  return supabaseConfigOf(c.env);
}

export function supabaseConfigOf(env: ApiEnv['Bindings']) {
  const config = supabaseConfigSchema.safeParse(env);
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

// Raised by the signing schema (ADR 023); the message is the reason.
const signingErrors: Record<
  string,
  { code: 'conflict' | 'unprocessable' | 'validation_error'; message: string }
> = {
  SIG01: { code: 'conflict', message: 'The training record is signed; void its signatures first.' },
  SIG02: { code: 'conflict', message: 'This slot is signed already.' },
  SIG03: { code: 'unprocessable', message: 'The training record has no such slot.' },
  SIG04: { code: 'validation_error', message: 'A reason or a name is required.' },
  SIG05: { code: 'unprocessable', message: 'This person cannot sign this slot.' },
  SIG06: { code: 'conflict', message: 'A signature is written once.' },
  SIG07: {
    code: 'conflict',
    message: 'An agreement signed electronically is changed only by the signing flow.',
  },
  SIG08: { code: 'conflict', message: 'The signature request is no longer pending.' },
  SIG09: { code: 'conflict', message: 'The signing session does not cover this signature.' },
  SIG10: { code: 'conflict', message: 'The signing agreement does not take this change.' },
};

// Raised by the knowledge tests' schema (ADR 024); the message is the reason, as in
// `testErrorReasons` of the contracts.
const testErrors: Record<string, { code: 'conflict' | 'validation_error'; message: string }> = {
  TST01: {
    code: 'conflict',
    message: 'Un test trebuie să păstreze cel puțin zece întrebări active.',
  },
  TST02: {
    code: 'conflict',
    message: 'Numai o întrebare predefinită a aceluiași test se ascunde sau se înlocuiește.',
  },
  TST03: { code: 'conflict', message: 'Încercarea este încheiată și nu se mai schimbă.' },
  TST04: {
    code: 'validation_error',
    message: 'Răspunsul nu se potrivește cu întrebările testului.',
  },
  TST05: { code: 'conflict', message: 'Testul nu așteaptă acum angajatul.' },
  TST06: {
    code: 'conflict',
    message: 'Un rezultat din portal se schimbă numai în examinator și nu se șterge.',
  },
  TST07: {
    code: 'conflict',
    message: 'Examinatorul a semnat fișa de test, deci nu se mai schimbă.',
  },
  TST08: { code: 'conflict', message: 'Fișa de test nu se șterge și nu se întocmește din nou.' },
};

// Translate PostgREST/Postgres failures into API errors without leaking details.
export function fromDatabaseError(error: PostgrestError, context: string): ApiError {
  const known = error.code ? (signingErrors[error.code] ?? testErrors[error.code]) : undefined;
  if (known) {
    return new ApiError(known.code, known.message, undefined, error.message || undefined);
  }
  switch (error.code) {
    case '23505':
      return new ApiError('conflict');
    case '23503':
      return new ApiError('conflict', 'Other records depend on this one.');
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
