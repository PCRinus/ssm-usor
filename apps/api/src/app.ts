import { OpenAPIHono } from '@hono/zod-openapi';
import type { ApiErrorResponse, ApiHealth, MeResponse } from '@ssm-usor/contracts';
import { normalizeCui } from '@ssm-usor/contracts';
import { cors } from 'hono/cors';

import { lookupCompany } from './anaf';
import { createClient, listClients } from './clients';
import { requestFetch } from './db';
import { allowedOrigins, type ApiEnv } from './env';
import { ApiError, defaultMessages, errorStatus } from './errors';
import {
  createClientRoute,
  healthRoute,
  listClientsRoute,
  lookupCompanyRoute,
  meRoute,
  openApiConfig,
} from './openapi';

export function createApp() {
  const app = new OpenAPIHono<ApiEnv>({
    // Request validation failures share the API error shape.
    defaultHook: (result, c) => {
      if (result.success) return;
      return c.json(
        {
          error: 'validation_error',
          message: defaultMessages.validation_error,
          issues: result.error.issues.map((issue) => ({
            path: issue.path.map(String).join('.'),
            message: issue.message,
          })),
        } satisfies ApiErrorResponse,
        400
      );
    },
  });

  app.use('*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    await next();
  });
  app.use('*', (c, next) =>
    cors({
      origin: allowedOrigins(c.env),
      allowHeaders: ['Authorization', 'Content-Type'],
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      maxAge: 600,
    })(c, next)
  );

  app.openapi(healthRoute, (c) =>
    c.json({ status: 'ok', service: 'ssm-usor-api' } satisfies ApiHealth, 200)
  );

  app.openapi(meRoute, (c) => c.json({ user: c.get('user') } satisfies MeResponse, 200));

  app.openapi(listClientsRoute, listClients);
  app.openapi(createClientRoute, createClient);

  app.openapi(lookupCompanyRoute, async (c) => {
    const { cui } = normalizeCui(c.req.valid('query').cui)!;
    const company = await lookupCompany(cui, requestFetch(c, 8_000));
    if (!company) throw new ApiError('not_found', 'No company is registered with this CUI.');
    return c.json({ company }, 200);
  });

  app.openAPIRegistry.registerComponent('securitySchemes', 'bearerAuth', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
  });
  app.doc('/openapi.json', openApiConfig);

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
        { error: error.code, message: error.message } satisfies ApiErrorResponse,
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
