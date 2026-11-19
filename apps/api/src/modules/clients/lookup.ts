import {
  archivedClientError,
  clientIsLeadError,
  type DataClient,
  fromDatabaseError,
} from '../../lib/db';
import { ApiError } from '../../lib/errors';

export const clientNotFound = () =>
  new ApiError('not_found', 'This client does not exist in your organization.');

// Row-level security hides other organizations' clients, so a missing row is a 404 whether the
// client belongs to someone else or does not exist at all.
export async function requireClient(db: DataClient, clientId: string) {
  const { data, error } = await db
    .from('clients')
    .select('id, stage, archived_at')
    .eq('id', clientId)
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'find client');
  if (!data) throw clientNotFound();
  return data;
}

// The database's triggers refuse an archived client, and a lead where it has no records, but
// only once the row is written: asked first, nothing outside the database is touched before.
export async function requireWritableClient(
  db: DataClient,
  clientId: string,
  options?: { lead: 'refused' }
) {
  const client = await requireClient(db, clientId);
  if (client.archived_at) throw archivedClientError();
  if (client.stage === 'lead' && options?.lead === 'refused') throw clientIsLeadError();
  return client;
}
