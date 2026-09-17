import { createMiddleware } from 'hono/factory';

import type { Database } from '../database.types';
import { createDataClient, fromDatabaseError } from './db';
import type { ApiEnv } from './env';
import { ApiError } from './errors';

export interface Membership {
  // The effective user: the impersonated user during an active impersonation.
  userId: string;
  organizationId: string;
  role: Database['public']['Enums']['organization_role'];
}

// Resolves the caller's effective organization through the database helper, so the
// API and the row-level security policies always agree on who the caller acts for.
export const requireMembership = createMiddleware<ApiEnv>(async (c, next) => {
  const db = createDataClient(c);
  const { data, error } = await db.rpc('current_membership');
  if (error) throw fromDatabaseError(error, 'current_membership');
  const membership = data?.[0];
  if (!membership) {
    throw new ApiError('forbidden', 'This account is not a member of an organization.');
  }
  c.set('membership', {
    userId: membership.user_id,
    organizationId: membership.organization_id,
    role: membership.role,
  });
  await next();
});
