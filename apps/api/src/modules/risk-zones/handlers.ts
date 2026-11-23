import type { RouteHandler } from '@hono/zod-openapi';
import type { RiskZoneRequest } from '@ssm-usor/contracts';

import {
  archivedClientError,
  createDataClient,
  type DataClient,
  fromDatabaseError,
} from '../../lib/db';
import type { ApiEnv } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import { clientNotFound, requireClient, requireWritableClient } from '../clients/lookup';
import type {
  createRiskZoneRoute,
  ignoreRiskZoneSuggestionRoute,
  listRiskZonesRoute,
  removeRiskZoneRoute,
  restoreRiskZoneSuggestionRoute,
  riskZoneNamesRoute,
  updateRiskZoneRoute,
  updateRiskZonesStateRoute,
} from './routes';
import { loadRiskZones } from './zones';

const noSuchZone = () =>
  new ApiError('not_found', 'This risk zone does not exist under this client.');

const invalid = (path: string, message: string) =>
  new ApiError('validation_error', message, [{ path, message }]);

const saveErrors: Record<string, () => ApiError> = {
  RZN02: () => invalid('measures', 'Link a risk factor or write the zone’s own measures.'),
  RZN03: () => invalid('workplaceId', 'Choose a current workplace of this client.'),
  RZN04: () => invalid('factorIds', 'Link only risk factors of this client.'),
  '23505': () =>
    new ApiError(
      'conflict',
      'This client already has a risk zone of this name.',
      [{ path: 'name', message: 'This client already has a risk zone of this name.' }],
      'risk_zone_name_taken'
    ),
};

async function saveZone(
  db: DataClient,
  clientId: string,
  zoneId: string | undefined,
  body: RiskZoneRequest
) {
  const { data, error } = await db.rpc('save_risk_zone', {
    p_client_id: clientId,
    p_zone_id: zoneId,
    p_name: body.name,
    p_factor_ids: body.factorIds,
    // Left out, the database sets null: the generated types do not take null for these.
    p_workplace_id: body.workplaceId ?? undefined,
    p_location: body.location ?? undefined,
    p_measures: body.measures ?? undefined,
  });
  const known = error?.code ? saveErrors[error.code] : undefined;
  if (known) throw known();
  if (error) throw fromDatabaseError(error, 'save risk zone');
  return data;
}

export const listRiskZones: RouteHandler<typeof listRiskZonesRoute, ApiEnv> = async (c) => {
  const { clientId } = c.req.valid('param');
  return c.json(await loadRiskZones(createDataClient(c), clientId), 200);
};

export const createRiskZone: RouteHandler<typeof createRiskZoneRoute, ApiEnv> = async (c) => {
  const { clientId } = c.req.valid('param');
  const db = createDataClient(c);
  await requireWritableClient(db, clientId, { lead: 'refused' });
  const saved = await saveZone(db, clientId, undefined, c.req.valid('json'));
  if (!saved) throw clientNotFound();
  return c.json(await loadRiskZones(db, clientId), 201);
};

export const updateRiskZone: RouteHandler<typeof updateRiskZoneRoute, ApiEnv> = async (c) => {
  const { clientId, zoneId } = c.req.valid('param');
  const db = createDataClient(c);
  const saved = await saveZone(db, clientId, zoneId, c.req.valid('json'));
  if (!saved) throw noSuchZone();
  return c.json(await loadRiskZones(db, clientId), 200);
};

export const removeRiskZone: RouteHandler<typeof removeRiskZoneRoute, ApiEnv> = async (c) => {
  const { clientId, zoneId } = c.req.valid('param');
  const db = createDataClient(c);
  const { data, error } = await db
    .from('risk_zones')
    .delete()
    .eq('id', zoneId)
    .eq('client_id', clientId)
    .select('id');
  if (error) throw fromDatabaseError(error, 'delete risk zone');
  if (data.length === 0) throw noSuchZone();
  return c.json(await loadRiskZones(db, clientId), 200);
};

export const updateRiskZonesState: RouteHandler<typeof updateRiskZonesStateRoute, ApiEnv> = async (
  c
) => {
  const { clientId } = c.req.valid('param');
  const { state } = c.req.valid('json');
  const db = createDataClient(c);
  await requireClient(db, clientId);
  const { data, error } = await db
    .from('clients')
    .update({ risk_zones_state: state })
    .eq('id', clientId)
    .is('archived_at', null)
    .select('id')
    .maybeSingle();
  if (error?.code === 'RZN01') {
    throw ApiError.conflict(
      'risk_zones_listed',
      'The client has risk zones; delete them before saying it has none.'
    );
  }
  if (error) throw fromDatabaseError(error, 'update risk zones state');
  if (!data) throw archivedClientError();
  return c.json(await loadRiskZones(db, clientId), 200);
};

export const listRiskZoneNames: RouteHandler<typeof riskZoneNamesRoute, ApiEnv> = async (c) => {
  const { exceptClientId } = c.req.valid('query');
  const { data, error } = await createDataClient(c).rpc('risk_zone_names', {
    p_except_client_id: exceptClientId,
  });
  if (error) throw fromDatabaseError(error, 'list risk zone names');
  return c.json(
    { items: data.map((row) => ({ name: row.name, measures: row.measures ?? null })) },
    200
  );
};

export const ignoreRiskZoneSuggestion: RouteHandler<
  typeof ignoreRiskZoneSuggestionRoute,
  ApiEnv
> = async (c) => {
  const { clientId } = c.req.valid('param');
  const { factorIds } = c.req.valid('json');
  const db = createDataClient(c);
  await requireWritableClient(db, clientId, { lead: 'refused' });
  const organizationId = c.get('membership').organizationId;
  const createdBy = c.get('user').id;
  const { error } = await db.from('risk_zone_ignored_factors').upsert(
    [...new Set(factorIds)].map((factorId) => ({
      factor_id: factorId,
      client_id: clientId,
      organization_id: organizationId,
      created_by: createdBy,
    })),
    { onConflict: 'factor_id', ignoreDuplicates: true }
  );
  if (error?.code === '23503')
    throw invalid('factorIds', 'Ignore only risk factors of this client.');
  if (error) throw fromDatabaseError(error, 'ignore risk zone suggestion');
  return c.json(await loadRiskZones(db, clientId), 200);
};

export const restoreRiskZoneSuggestion: RouteHandler<
  typeof restoreRiskZoneSuggestionRoute,
  ApiEnv
> = async (c) => {
  const { clientId } = c.req.valid('param');
  const { factorIds } = c.req.valid('json');
  const db = createDataClient(c);
  const { error } = await db
    .from('risk_zone_ignored_factors')
    .delete()
    .eq('client_id', clientId)
    .in('factor_id', factorIds);
  if (error) throw fromDatabaseError(error, 'restore risk zone suggestion');
  return c.json(await loadRiskZones(db, clientId), 200);
};
