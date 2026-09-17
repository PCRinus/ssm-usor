import { OpenAPIHono } from '@hono/zod-openapi';
import type { ApiErrorResponse } from '@ssm-usor/contracts';

import type { ApiEnv } from './lib/env';
import { defaultMessages } from './lib/errors';

// Every module router shares the environment and the validation error shape,
// so the app can mount modules with app.route() and merge their OpenAPI definitions.
export function createRouter() {
  return new OpenAPIHono<ApiEnv>({
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
}

export type ApiRouter = ReturnType<typeof createRouter>;
