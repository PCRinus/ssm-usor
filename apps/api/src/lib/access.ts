import type { AccessLevel } from '@ssm-usor/contracts';
import { readOnlyReason } from '@ssm-usor/contracts';
import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';

import type { ApiEnv } from './env';
import { ApiError } from './errors';

const changes = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// For a route whose method changes nothing for the organization, such as printing a PDF of
// unsaved edits or accepting the portal's notice. Goes before the membership or participant
// middleware.
export const allowWhileReadOnly = createMiddleware<ApiEnv>(async (c, next) => {
  c.set('readOnlyAllowed', true);
  await next();
});

// The database does not enforce read-only access (ADR 029); every change through the API stops here.
export function assertWritable(c: Context<ApiEnv>, access: AccessLevel | undefined) {
  if (access !== 'read_only' || !changes.has(c.req.method) || c.get('readOnlyAllowed')) return;
  throw new ApiError(
    'forbidden',
    'The organization is read-only: its trial or subscription has ended.',
    undefined,
    readOnlyReason
  );
}
