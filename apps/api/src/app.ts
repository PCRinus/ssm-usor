import type { ApiErrorResponse, ApiHealth, MeResponse } from '@ssm-usor/contracts';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { requireAuth } from './auth';
import { allowedOrigins, type ApiEnv } from './env';
import { ApiError } from './errors';

export function createApp() {
  const app = new Hono<ApiEnv>();

  app.use('*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    await next();
  });
  app.use('*', (c, next) =>
    cors({
      origin: allowedOrigins(c.env),
      allowHeaders: ['Authorization', 'Content-Type'],
      allowMethods: ['GET', 'OPTIONS'],
      maxAge: 600,
    })(c, next)
  );

  app.get('/health', (c) => c.json({ status: 'ok', service: 'ssm-usor-api' } satisfies ApiHealth));

  app.get('/me', requireAuth, (c) => c.json({ user: c.get('user') } satisfies MeResponse));

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
      if (error.code === 'unauthorized') {
        c.header('WWW-Authenticate', 'Bearer');
        return c.json(
          {
            error: 'unauthorized',
            message: 'A valid access token is required.',
          } satisfies ApiErrorResponse,
          401
        );
      }
      return c.json(
        {
          error: 'service_unavailable',
          message: 'Authentication is temporarily unavailable.',
        } satisfies ApiErrorResponse,
        503
      );
    }

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
