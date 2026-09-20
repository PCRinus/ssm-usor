import type { RouteHandler } from '@hono/zod-openapi';
import {
  serviceContractConflictReasons,
  type ServiceContractResponse,
  serviceContractTypeKey,
} from '@ssm-usor/contracts';

import { createDataClient, type DataClient, fromDatabaseError } from '../../lib/db';
import type { ApiEnv } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import { readOtherDocument } from '../documents/documents';
import { loadServiceContractFacts, missingServiceContractData } from './facts';
import type { getServiceContractRoute, saveServiceContractRoute } from './routes';

// The register usually starts again each year, so the year of the contract decides.
async function suggestedNumber(db: DataClient, year: number) {
  const inYear = await db
    .from('service_contracts')
    .select('contract_number')
    .gte('contract_date', `${year}-01-01`)
    .lte('contract_date', `${year}-12-31`)
    .order('contract_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (inYear.error) throw fromDatabaseError(inYear.error, 'last contract number of the year');
  if (inYear.data) return inYear.data.contract_number + 1;
  const any = await db.from('service_contracts').select('id').limit(1).maybeSingle();
  if (any.error) throw fromDatabaseError(any.error, 'any contract');
  return any.data ? 1 : null;
}

async function respond(db: DataClient, clientId: string): Promise<ServiceContractResponse> {
  const facts = await loadServiceContractFacts(db, clientId);
  const year = Number((facts.contract?.contractDate ?? new Date().toISOString()).slice(0, 4));
  const [suggested, document] = await Promise.all([
    facts.contract ? null : suggestedNumber(db, year),
    readOtherDocument(db, clientId, serviceContractTypeKey),
  ]);
  const missing = missingServiceContractData(facts);
  return {
    contract: facts.contract,
    suggestedNumber: suggested,
    clientRepresentative: {
      name: facts.client.legal_representative_name,
      role: facts.client.legal_representative_role,
    },
    readiness: { ready: missing.length === 0, missing },
    document,
  };
}

export const getServiceContract: RouteHandler<typeof getServiceContractRoute, ApiEnv> = async (
  c
) => {
  const { clientId } = c.req.valid('param');
  return c.json(await respond(createDataClient(c), clientId), 200);
};

export const saveServiceContract: RouteHandler<typeof saveServiceContractRoute, ApiEnv> = async (
  c
) => {
  const { clientId } = c.req.valid('param');
  const body = c.req.valid('json');
  const db = createDataClient(c);
  const userId = c.get('user').id;

  // The client first: a lead or a client that is not there answers 404 before anything is
  // written, and an archived one is refused by its trigger.
  const representative = {
    ...(body.clientRepresentativeName !== undefined && {
      legal_representative_name: body.clientRepresentativeName,
    }),
    ...(body.clientRepresentativeRole !== undefined && {
      legal_representative_role: body.clientRepresentativeRole,
    }),
  };
  const client =
    Object.keys(representative).length > 0
      ? await db
          .from('clients')
          .update(representative)
          .eq('id', clientId)
          .select('id')
          .maybeSingle()
      : await db.from('clients').select('id').eq('id', clientId).maybeSingle();
  if (client.error) throw fromDatabaseError(client.error, 'client of the service contract');
  if (!client.data) {
    throw new ApiError('not_found', 'This client does not exist in your organization.');
  }

  const details = {
    contract_number: body.contractNumber,
    contract_date: body.contractDate,
    start_date: body.startDate,
    duration_months: body.durationMonths,
    renews_automatically: body.renewsAutomatically,
    covers_occupational_safety: body.coversOccupationalSafety,
    covers_fire_safety: body.coversFireSafety,
    updated_by: userId,
  };
  // An update, then an insert: an upsert would write `created_by` again on every save.
  let saved = await db
    .from('service_contracts')
    .update(details)
    .eq('client_id', clientId)
    .select('id')
    .maybeSingle();
  if (!saved.error && !saved.data) {
    saved = await db
      .from('service_contracts')
      .insert({
        ...details,
        organization_id: c.get('membership').organizationId,
        client_id: clientId,
        created_by: userId,
      })
      .select('id')
      .single();
  }
  if (saved.error?.code === '23505') {
    throw new ApiError(
      'conflict',
      'Another contract of that year has this number.',
      undefined,
      serviceContractConflictReasons.numberTaken
    );
  }
  if (saved.error) throw fromDatabaseError(saved.error, 'save service contract');
  return c.json(await respond(db, clientId), 200);
};
