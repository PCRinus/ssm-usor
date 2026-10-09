import { Scalar } from '@scalar/hono-api-reference';
import type { ApiErrorResponse } from '@ssm-usor/contracts';
import { cors } from 'hono/cors';
import { timing } from 'hono/timing';

import { allowedOrigins, marketingOrigin } from './lib/env';
import { ApiError, errorStatus } from './lib/errors';
import { openApiConfig } from './lib/openapi';
import { authHooksRouter } from './modules/auth-hooks';
import { clientFilesRouter } from './modules/client-files';
import { clientsRouter } from './modules/clients';
import { companiesRouter } from './modules/companies';
import { contractReturnsRouter } from './modules/contract-returns';
import { documentDataRouter } from './modules/document-data';
import { documentsRouter } from './modules/documents';
import { employeesRouter } from './modules/employees';
import { evaluationProfilesRouter } from './modules/evaluation-profiles';
import { filesRouter } from './modules/files';
import { healthRouter } from './modules/health';
import { instructionModulesRouter } from './modules/instruction-modules';
import { invitationsRouter } from './modules/invitations';
import { jobPositionsRouter } from './modules/job-positions';
import { legislationRouter } from './modules/legislation';
import { meRouter } from './modules/me';
import { organizationRouter } from './modules/organization';
import { protectiveEquipmentRouter } from './modules/protective-equipment';
import { riskEvaluationsRouter } from './modules/risk-evaluations';
import { serviceContractsRouter } from './modules/service-contracts';
import { waitlistRouter } from './modules/waitlist';
import { createRouter } from './router';

export function createApp() {
  const app = createRouter();

  // Every 5xx leaves a line, also from a path that does not log its cause. The ray id is the
  // one the SPA reports for a failed request.
  app.use('*', async (c, next) => {
    const started = Date.now();
    await next();
    if (c.res.status < 500) return;
    console.error(
      `${c.req.method} ${c.req.path} answered ${c.res.status} after ${Date.now() - started} ms (ray ${c.req.header('cf-ray') ?? 'none'})`
    );
  });
  // Server-Timing on every answer: the whole request, and the token and membership checks
  // that precede every handler, so a slow page can be read apart in the browser's network tab.
  app.use('*', timing());
  app.use('*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    await next();
  });
  app.use('*', (c, next) =>
    cors({
      // The waitlist form is the only thing the marketing site may call.
      origin: c.req.path === '/waitlist' ? [marketingOrigin(c.env)] : allowedOrigins(c.env),
      allowHeaders: ['Authorization', 'Content-Type'],
      exposeHeaders: ['cf-ray'],
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      maxAge: 600,
    })(c, next)
  );

  app.route('/', healthRouter);
  app.route('/', meRouter);
  app.route('/', clientsRouter);
  app.route('/', companiesRouter);
  app.route('/', employeesRouter);
  app.route('/', jobPositionsRouter);
  app.route('/', protectiveEquipmentRouter);
  app.route('/', instructionModulesRouter);
  app.route('/', riskEvaluationsRouter);
  app.route('/', evaluationProfilesRouter);
  app.route('/', documentDataRouter);
  app.route('/', documentsRouter);
  app.route('/', clientFilesRouter);
  app.route('/', filesRouter);
  app.route('/', serviceContractsRouter);
  app.route('/', contractReturnsRouter);
  app.route('/', organizationRouter);
  app.route('/', legislationRouter);
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
          ...(error.missing ? { missing: error.missing } : {}),
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
