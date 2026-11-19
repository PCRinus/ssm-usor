import type { Context } from 'hono';

import type { ApiEnv } from './env';

// Hono's executionCtx throws where the runtime gives none, as in tests.
export function later(c: Context<ApiEnv>, work: Promise<unknown>) {
  try {
    c.executionCtx.waitUntil(work);
  } catch {
    void work;
  }
}
