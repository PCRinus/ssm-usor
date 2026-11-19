import { type DataClient, fromDatabaseError } from '../../lib/db';
import { ApiError } from '../../lib/errors';

export const workplaceNotOfClient = () => {
  const message = 'This workplace is not an active workplace of this client.';
  return new ApiError('validation_error', message, [{ path: 'workplaceId', message }]);
};

export const officeWithoutActivity = () => {
  const message = 'No activity takes place at this registered office.';
  return new ApiError('validation_error', message, [{ path: 'workplaceId', message }]);
};

/**
 * The foreign key alone would take an archived workplace, which no document lists. With
 * `withActivity`, also a registered office where no activity takes place (ADR 041), which
 * nobody works at and which carries no SU data.
 */
export async function refuseWorkplaceOfAnotherClient(
  db: DataClient,
  clientId: string,
  workplaceId: string | null | undefined,
  { withActivity = false }: { withActivity?: boolean } = {}
) {
  if (!workplaceId) return;
  const { data, error } = await db
    .from('client_workplaces')
    .select('id, office_has_activity')
    .eq('id', workplaceId)
    .eq('client_id', clientId)
    .is('archived_at', null)
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'find workplace');
  if (!data) throw workplaceNotOfClient();
  if (withActivity && !data.office_has_activity) throw officeWithoutActivity();
  return data;
}
