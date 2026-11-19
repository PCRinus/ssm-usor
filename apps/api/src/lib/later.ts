import type { Context } from 'hono';

import type { ApiEnv } from './env';
import { ApiError } from './errors';

// Hono's executionCtx throws where the runtime gives none, as in tests.
export function later(c: Context<ApiEnv>, work: Promise<unknown>) {
  try {
    c.executionCtx.waitUntil(work);
  } catch {
    void work;
  }
}

// A best-effort failure is logged by its reason or name alone: its message can quote a row.
export function failureLabel(error: unknown) {
  if (error instanceof ApiError) return error.reason ?? error.code;
  return error instanceof Error ? error.name : 'unknown';
}
