import { offersNotInPlanReason } from '@ssm-usor/contracts';

import { type DataClient, fromDatabaseError } from './db';
import { ApiError } from './errors';

export const offersNotInPlanError = () =>
  new ApiError(
    'forbidden',
    'Offers are part of the Profesional plan; this one is only read.',
    undefined,
    offersNotInPlanReason
  );

// Asked before an email goes out or a file is touched: the database refuses the row too, but
// only after them.
export async function requireOffersFor(db: DataClient, client: { stage: string }) {
  if (client.stage !== 'lead') return;
  const { data, error } = await db.rpc('current_organization_has_offers');
  if (error) throw fromDatabaseError(error, 'organization has offers');
  if (!data) throw offersNotInPlanError();
}
