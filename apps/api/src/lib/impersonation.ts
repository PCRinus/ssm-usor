import { actingAsHeader, actingAsSelf, impersonationErrorReasons } from '@ssm-usor/contracts';
import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';

import { createDataClient, type DataClient, fromDatabaseError } from './db';
import type { ApiEnv } from './env';
import { ApiError } from './errors';
import type { Membership } from './membership';

export const impersonationColumns = 'id, target_user_id, reason, started_at, expires_at, ended_at';

// By the database's clock, by which effective_user_id() decides whom the next query acts as.
export async function readCurrentImpersonation(db: DataClient) {
  const { data, error } = await db
    .rpc('current_impersonation')
    .select(impersonationColumns)
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'read active impersonation');
  return data;
}

// The database stamps the end: an expired one ends at its expiry, and records no event.
export async function endActiveImpersonation(db: DataClient, adminId: string) {
  const { error } = await db
    .from('impersonations')
    .update({ ended_at: new Date().toISOString() })
    .eq('admin_user_id', adminId)
    .is('ended_at', null);
  if (error) throw fromDatabaseError(error, 'end impersonation');
}

export type ImpersonationRow = NonNullable<Awaited<ReturnType<typeof readCurrentImpersonation>>>;

export async function currentImpersonation(c: Context<ApiEnv>) {
  if (!c.get('mayImpersonate')) return null;
  let row = c.get('impersonation');
  if (row === undefined) {
    row = await readCurrentImpersonation(createDataClient(c));
    c.set('impersonation', row);
  }
  return row;
}

// The membership is what the database decided, even on a token whose admin role was removed
// since it was issued.
export async function isImpersonating(c: Context<ApiEnv>) {
  const membership = c.get('membership') as Membership | undefined;
  if (membership) return membership.userId !== c.get('user').id;
  return (await currentImpersonation(c)) !== null;
}

// An impersonation applies to all of the admin's tabs and windows at once, so only the API can
// tell that a page was built for someone else before the request reads or writes for them.
export async function refuseChangedIdentity(c: Context<ApiEnv>) {
  const pageBuiltFor = c.req.header(actingAsHeader);
  if (pageBuiltFor === undefined || !c.get('mayImpersonate')) return;
  const actsAs = (await currentImpersonation(c))?.target_user_id ?? actingAsSelf;
  if (pageBuiltFor !== actsAs) {
    throw new ApiError(
      'conflict',
      'The page was built for someone other than whom this account acts as now. Reload it.',
      undefined,
      impersonationErrorReasons.identityChanged
    );
  }
}

export const impersonationRefused = () =>
  new ApiError(
    'forbidden',
    'A platform admin impersonating a member cannot sign or send messages in their name.',
    undefined,
    impersonationErrorReasons.refused
  );

export async function refuseImpersonation(c: Context<ApiEnv>) {
  if (await isImpersonating(c)) throw impersonationRefused();
}

// After the auth and membership middleware, so the refusal comes before the handler writes
// anything that would be left without its message.
export const refuseDuringImpersonation = createMiddleware<ApiEnv>(async (c, next) => {
  await refuseImpersonation(c);
  await next();
});

// Without a membership the request acts as the signed-in account, as the portal does, so only
// a membership that is not the caller's own is refused.
function refuseSendInMembersName(c: Context<ApiEnv>) {
  const membership = c.get('membership') as Membership | undefined;
  if (membership && membership.userId !== c.get('user').id) throw impersonationRefused();
}

function refusingDuringImpersonation<T extends object>(c: Context<ApiEnv>, service: T): T {
  return new Proxy(service, {
    get(target, property) {
      const value: unknown = Reflect.get(target, property);
      // A function for `then` would make the binding look like a promise to whoever awaits it.
      if (typeof value !== 'function' || property === 'then') return value;
      // Reflect.apply, not value.apply: on an RPC stub `.apply` would name a remote method.
      return async (...args: unknown[]) => {
        refuseSendInMembersName(c);
        return Reflect.apply(value, target, args);
      };
    },
  });
}

// Every email and SMS a request sends leaves through c.env, so a route that forgets to refuse
// an impersonating admin is refused here. Queues, scheduled work and the webhooks get their env
// from the runtime and never pass through this.
export const guardMessagesDuringImpersonation = createMiddleware<ApiEnv>(async (c, next) => {
  const { MAIL, SMS } = c.env;
  c.env = {
    ...c.env,
    MAIL: MAIL && refusingDuringImpersonation(c, MAIL),
    SMS: SMS && refusingDuringImpersonation(c, SMS),
  };
  await next();
});
