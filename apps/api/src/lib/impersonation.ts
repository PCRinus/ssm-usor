import { impersonationErrorReasons } from '@ssm-usor/contracts';
import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';

import { createDataClient, type DataClient, fromDatabaseError } from './db';
import type { ApiEnv } from './env';
import { ApiError } from './errors';

export const impersonationColumns = 'id, target_user_id, reason, started_at, expires_at, ended_at';

export async function activeImpersonation(db: DataClient, adminId: string) {
  const { data, error } = await db
    .from('impersonations')
    .select(impersonationColumns)
    .eq('admin_user_id', adminId)
    .is('ended_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'read active impersonation');
  return data;
}

// An expired one is left as it is: it ended at its expiry, and ending it now would record an end
// that never happened.
export async function endActiveImpersonation(db: DataClient, adminId: string) {
  const { error } = await db
    .from('impersonations')
    .update({ ended_at: new Date().toISOString() })
    .eq('admin_user_id', adminId)
    .is('ended_at', null)
    .gt('expires_at', new Date().toISOString());
  if (error) throw fromDatabaseError(error, 'end impersonation');
}

export type ImpersonationRow = NonNullable<Awaited<ReturnType<typeof activeImpersonation>>>;

// Only a platform admin can have one active (effective_user_id()), so nobody else costs a read.
export async function isImpersonating(c: Context<ApiEnv>) {
  if (!c.get('platformAdmin')) return false;
  const membership = c.get('membership') as ApiEnv['Variables']['membership'] | undefined;
  if (membership) return membership.userId !== c.get('user').id;
  let known = c.get('impersonating');
  if (known === undefined) {
    known = (await activeImpersonation(createDataClient(c), c.get('user').id)) !== null;
    c.set('impersonating', known);
  }
  return known;
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

function refusingDuringImpersonation<T extends object>(c: Context<ApiEnv>, service: T): T {
  return new Proxy(service, {
    get(target, property) {
      const value: unknown = Reflect.get(target, property);
      // A function for `then` would make the binding look like a promise to whoever awaits it.
      if (typeof value !== 'function' || property === 'then') return value;
      // Reflect.apply, not value.apply: on an RPC stub `.apply` would name a remote method.
      return async (...args: unknown[]) => {
        await refuseImpersonation(c);
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
