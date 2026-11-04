import type { ApiErrorResponse, CurrentUser } from '@ssm-usor/contracts';
import { Hono } from 'hono';
import { timing } from 'hono/timing';

import { errorResponse, logServerErrors, noStore } from './app';
import { requireAdmin, requireAuth } from './lib/auth';
import type { ApiEnv } from './lib/env';

// Served only by the Admin entrypoint, which the admin Worker reaches through a service binding;
// the public `fetch` never mounts it (ADR 038). No CORS: the browser calls the admin Worker's
// own origin.
export function createAdminApp() {
  const app = new Hono<ApiEnv>().basePath('/admin');

  app.use('*', logServerErrors);
  app.use('*', timing());
  app.use('*', noStore);
  app.use('*', requireAuth, requireAdmin);

  app.get('/me', (c) => c.json(c.get('user') satisfies CurrentUser));

  app.notFound((c) =>
    c.json(
      {
        error: 'not_found',
        message: 'The requested admin route does not exist.',
      } satisfies ApiErrorResponse,
      404
    )
  );
  app.onError(errorResponse);

  return app;
}
