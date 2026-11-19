import type { ApiErrorResponse } from '@ssm-usor/contracts';
import type { z } from 'zod';

import { ApiError } from './errors';

export function toIssues(error: z.ZodError): NonNullable<ApiErrorResponse['issues']> {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }));
}

// The admin app is plain Hono (ADR 038): its handlers validate what the routers' hook would.
export function parsed<Schema extends z.ZodType>(schema: Schema, value: unknown): z.infer<Schema> {
  const result = schema.safeParse(value);
  if (!result.success) throw new ApiError('validation_error', undefined, toIssues(result.error));
  return result.data;
}
