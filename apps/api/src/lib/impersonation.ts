import { type DataClient, fromDatabaseError } from './db';

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
