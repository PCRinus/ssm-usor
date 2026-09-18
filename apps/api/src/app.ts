import { Scalar } from '@scalar/hono-api-reference';
import type { ApiErrorResponse } from '@ssm-usor/contracts';
import { cors } from 'hono/cors';

import { allowedOrigins, marketingOrigin } from './lib/env';
import { ApiError, errorStatus } from './lib/errors';
import { openApiConfig } from './lib/openapi';
import { authHooksRouter } from './modules/auth-hooks';
import { clientsRouter } from './modules/clients';
import { companiesRouter } from './modules/companies';
import { documentDataRouter } from './modules/document-data';
import { employeesRouter } from './modules/employees';
import { healthRouter } from './modules/health';
import { invitationsRouter } from './modules/invitations';
import { meRouter } from './modules/me';
import { organizationRouter } from './modules/organization';
import { waitlistRouter } from './modules/waitlist';
import { createRouter } from './router';

// Cross-cutting concerns live here; each domain module owns its routes and handlers.
export function createApp() {
  const app = createRouter();

  app.use('*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    await next();
  });
  app.use('*', (c, next) =>
    cors({
      // The waitlist form is the only thing the marketing site may call.
      origin: c.req.path === '/waitlist' ? [marketingOrigin(c.env)] : allowedOrigins(c.env),
      allowHeaders: ['Authorization', 'Content-Type'],
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      maxAge: 600,
    })(c, next)
  );

  app.route('/', healthRouter);
  app.route('/', meRouter);
  app.route('/', clientsRouter);
  app.route('/', companiesRouter);
  app.route('/', employeesRouter);
  app.route('/', documentDataRouter);
  app.route('/', organizationRouter);
  app.route('/', invitationsRouter);
  app.route('/', waitlistRouter);
  app.route('/', authHooksRouter);

  app.openAPIRegistry.registerComponent('securitySchemes', 'bearerAuth', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
  });
  app.doc('/openapi.json', openApiConfig);
  app.get('/docs', Scalar({ url: '/openapi.json' }));

  app.notFound((c) =>
    c.json(
      {
        error: 'not_found',
        message: 'The requested API route does not exist.',
      } satisfies ApiErrorResponse,
      404
    )
  );

  app.onError((error, c) => {
    if (error instanceof ApiError) {
      if (error.code === 'unauthorized') c.header('WWW-Authenticate', 'Bearer');
      return c.json(
        {
          error: error.code,
          message: error.message,
          ...(error.issues ? { issues: error.issues } : {}),
          ...(error.reason ? { reason: error.reason } : {}),
        } satisfies ApiErrorResponse,
        errorStatus[error.code]
      );
    }

    console.error(`Unhandled API error: ${error.name}`);
    return c.json(
      {
        error: 'internal_error',
        message: 'An unexpected error occurred.',
      } satisfies ApiErrorResponse,
      500
    );
  });

  return app;
}
