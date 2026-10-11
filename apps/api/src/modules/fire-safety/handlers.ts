import type { RouteHandler } from '@hono/zod-openapi';
import {
  type ClientFireSafety,
  type FireEquipment,
  fireEquipmentKinds,
  type FireEquipmentRequest,
  fireExtinguishingAgents,
  type FireInstallation,
  fireInstallationKinds,
  type FireInstallationRequest,
  type FireSubstance,
  type FireSubstanceRequest,
  type FireSubstancesState,
  type UpdateClientFireSafetyRequest,
} from '@ssm-usor/contracts';

import type { Database } from '../../database.types';
import { createDataClient, type DataClient, fromDatabaseError } from '../../lib/db';
import type { ApiEnv } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import { refuseWorkplaceOfAnotherClient, workplaceNotOfClient } from '../document-data/handlers';
import type {
  createFireEquipmentRoute,
  createFireInstallationRoute,
  createFireSubstanceRoute,
  deleteFireEquipmentRoute,
  deleteFireInstallationRoute,
  deleteFireSubstanceRoute,
  getClientFireSafetyRoute,
  listFireEquipmentRoute,
  listFireInstallationsRoute,
  listFireSubstancesRoute,
  updateClientFireSafetyRoute,
  updateFireEquipmentRoute,
  updateFireInstallationRoute,
  updateFireSubstanceRoute,
  updateFireSubstancesStateRoute,
} from './routes';

type Tables = Database['public']['Tables'];

const noSuchClient = () =>
  new ApiError('not_found', 'This client does not exist in your organization.');

async function findClient(db: DataClient, clientId: string) {
  const { data, error } = await db.from('clients').select('id').eq('id', clientId).maybeSingle();
  if (error) throw fromDatabaseError(error, 'find client');
  if (!data) throw noSuchClient();
}

function fireSafetyError(error: { code: string }, context: string) {
  if (error.code === '23503') return workplaceNotOfClient();
  return fromDatabaseError(error, context);
}

async function activeWorkplaceOrder(db: DataClient, clientId: string) {
  const { data, error } = await db
    .from('client_workplaces')
    .select('id')
    .eq('client_id', clientId)
    .is('archived_at', null)
    .order('is_registered_office', { ascending: false })
    .order('name')
    .order('id');
  if (error) throw fromDatabaseError(error, 'list workplaces');
  return new Map(data.map((workplace, index) => [workplace.id, index]));
}

const fireSafetyColumns =
  'periodic_training_hours, administrative_training_interval_months, worker_training_interval_months, training_first_month, training_day_from, training_day_to, smoking_policy, smoking_place, waste_kinds, waste_contractor, waste_collectors, has_third_parties';

type FireSafetyRow = Pick<
  Tables['client_fire_safety']['Row'],
  | 'periodic_training_hours'
  | 'administrative_training_interval_months'
  | 'worker_training_interval_months'
  | 'training_first_month'
  | 'training_day_from'
  | 'training_day_to'
  | 'smoking_policy'
  | 'smoking_place'
  | 'waste_kinds'
  | 'waste_contractor'
  | 'waste_collectors'
  | 'has_third_parties'
>;

const toFireSafety = (row: FireSafetyRow): ClientFireSafety => ({
  periodicTrainingHours: row.periodic_training_hours,
  administrativeTrainingIntervalMonths: row.administrative_training_interval_months,
  workerTrainingIntervalMonths: row.worker_training_interval_months,
  trainingFirstMonth: row.training_first_month,
  trainingDayFrom: row.training_day_from,
  trainingDayTo: row.training_day_to,
  smokingPolicy: row.smoking_policy,
  smokingPlace: row.smoking_place,
  wasteKinds: row.waste_kinds,
  wasteContractor: row.waste_contractor,
  wasteCollectors: row.waste_collectors,
  hasThirdParties: row.has_third_parties,
});

const noFireSafety: ClientFireSafety = {
  periodicTrainingHours: null,
  administrativeTrainingIntervalMonths: null,
  workerTrainingIntervalMonths: null,
  trainingFirstMonth: null,
  trainingDayFrom: null,
  trainingDayTo: null,
  smokingPolicy: null,
  smokingPlace: null,
  wasteKinds: [],
  wasteContractor: null,
  wasteCollectors: null,
  hasThirdParties: false,
};

const fireSafetyFields = (body: UpdateClientFireSafetyRequest) => ({
  periodic_training_hours: body.periodicTrainingHours ?? null,
  administrative_training_interval_months: body.administrativeTrainingIntervalMonths ?? null,
  worker_training_interval_months: body.workerTrainingIntervalMonths ?? null,
  training_first_month: body.trainingFirstMonth ?? null,
  training_day_from: body.trainingDayFrom ?? null,
  training_day_to: body.trainingDayTo ?? null,
  smoking_policy: body.smokingPolicy ?? null,
  // Dropped rather than refused, so switching to another policy saves without emptying the field first (ADR 019).
  smoking_place: body.smokingPolicy === 'designated_places' ? (body.smokingPlace ?? null) : null,
  waste_kinds: body.wasteKinds,
  waste_contractor: body.wasteContractor ?? null,
  waste_collectors: body.wasteCollectors ?? null,
  has_third_parties: body.hasThirdParties,
});

// Saving the substances state alone creates the row too; the card still opens on its starting
// values then, so a row counts as the card's only once it holds something of the card.
const holdsCardFacts = (row: FireSafetyRow) =>
  [
    row.periodic_training_hours,
    row.administrative_training_interval_months,
    row.worker_training_interval_months,
    row.training_first_month,
    row.training_day_from,
    row.training_day_to,
    row.smoking_policy,
    row.waste_contractor,
    row.waste_collectors,
  ].some((value) => value !== null) ||
  row.waste_kinds.length > 0 ||
  row.has_third_parties;

export const getClientFireSafety: RouteHandler<typeof getClientFireSafetyRoute, ApiEnv> = async (
  c
) => {
  const { clientId } = c.req.valid('param');
  const db = createDataClient(c);
  await findClient(db, clientId);
  const { data, error } = await db
    .from('client_fire_safety')
    .select(fireSafetyColumns)
    .eq('client_id', clientId)
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'client fire safety');
  const saved = data !== null && holdsCardFacts(data);
  return c.json({ fireSafety: saved ? toFireSafety(data) : noFireSafety, exists: saved }, 200);
};

// Not an upsert: PostgREST's would also set the keys, which members may not update.
export const updateClientFireSafety: RouteHandler<
  typeof updateClientFireSafetyRoute,
  ApiEnv
> = async (c) => {
  const { clientId } = c.req.valid('param');
  const fields = fireSafetyFields(c.req.valid('json'));
  const db = createDataClient(c);
  await findClient(db, clientId);
  const update = () =>
    db
      .from('client_fire_safety')
      .update(fields)
      .eq('client_id', clientId)
      .select(fireSafetyColumns)
      .maybeSingle();
  const updated = await update();
  if (updated.error) throw fromDatabaseError(updated.error, 'update client fire safety');
  if (updated.data) return c.json({ fireSafety: toFireSafety(updated.data), exists: true }, 200);
  const inserted = await db
    .from('client_fire_safety')
    .insert({
      ...fields,
      client_id: clientId,
      organization_id: c.get('membership').organizationId,
      created_by: c.get('user').id,
    })
    .select(fireSafetyColumns)
    .single();
  if (inserted.error?.code === '23505') {
    // Another first save got there in between.
    const again = await update();
    if (again.error) throw fromDatabaseError(again.error, 'update client fire safety');
    if (again.data) return c.json({ fireSafety: toFireSafety(again.data), exists: true }, 200);
  }
  if (inserted.error) throw fromDatabaseError(inserted.error, 'create client fire safety');
  return c.json({ fireSafety: toFireSafety(inserted.data), exists: true }, 200);
};

const equipmentColumns =
  'id, client_id, workplace_id, kind, agent, capacity, wheeled, label, location, manufactured_year, last_service_on, next_service_on, maintainer, created_at, updated_at';

type EquipmentRow = Pick<
  Tables['fire_equipment']['Row'],
  | 'id'
  | 'client_id'
  | 'workplace_id'
  | 'kind'
  | 'agent'
  | 'capacity'
  | 'wheeled'
  | 'label'
  | 'location'
  | 'manufactured_year'
  | 'last_service_on'
  | 'next_service_on'
  | 'maintainer'
  | 'created_at'
  | 'updated_at'
>;

const toEquipment = (row: EquipmentRow): FireEquipment => ({
  id: row.id,
  clientId: row.client_id,
  workplaceId: row.workplace_id,
  kind: row.kind,
  agent: row.agent,
  capacity: row.capacity,
  wheeled: row.wheeled,
  label: row.label,
  location: row.location,
  manufacturedYear: row.manufactured_year,
  lastServiceOn: row.last_service_on,
  nextServiceOn: row.next_service_on,
  maintainer: row.maintainer,
  createdAt: new Date(row.created_at).toISOString(),
  updatedAt: new Date(row.updated_at).toISOString(),
});

const equipmentFields = (body: FireEquipmentRequest) => ({
  workplace_id: body.workplaceId,
  kind: body.kind,
  agent: body.agent ?? null,
  capacity: body.capacity ?? null,
  wheeled: body.wheeled,
  label: body.label ?? null,
  location: body.location ?? null,
  manufactured_year: body.manufacturedYear ?? null,
  last_service_on: body.lastServiceOn ?? null,
  next_service_on: body.nextServiceOn ?? null,
  maintainer: body.maintainer ?? null,
});

const noSuchEquipment = () =>
  new ApiError('not_found', 'This equipment does not exist under this client.');

const rank = <T extends string>(list: readonly T[], value: T | null) =>
  value === null ? list.length : list.indexOf(value);

const byText = (first: string | null, second: string | null) =>
  (first ?? '').localeCompare(second ?? '', 'ro');

export const listFireEquipment: RouteHandler<typeof listFireEquipmentRoute, ApiEnv> = async (c) => {
  const { clientId } = c.req.valid('param');
  const db = createDataClient(c);
  await findClient(db, clientId);
  const workplaces = await activeWorkplaceOrder(db, clientId);
  const { data, error } = await db
    .from('fire_equipment')
    .select(equipmentColumns)
    .eq('client_id', clientId);
  if (error) throw fromDatabaseError(error, 'list fire equipment');
  const items = data
    .filter((row) => workplaces.has(row.workplace_id))
    .sort(
      (first, second) =>
        workplaces.get(first.workplace_id)! - workplaces.get(second.workplace_id)! ||
        rank(fireEquipmentKinds, first.kind) - rank(fireEquipmentKinds, second.kind) ||
        rank(fireExtinguishingAgents, first.agent) - rank(fireExtinguishingAgents, second.agent) ||
        (first.capacity ?? 0) - (second.capacity ?? 0) ||
        byText(first.label, second.label) ||
        first.created_at.localeCompare(second.created_at)
    )
    .map(toEquipment);
  return c.json({ items }, 200);
};

export const createFireEquipment: RouteHandler<typeof createFireEquipmentRoute, ApiEnv> = async (
  c
) => {
  const { clientId } = c.req.valid('param');
  const body = c.req.valid('json');
  const db = createDataClient(c);
  await findClient(db, clientId);
  await refuseWorkplaceOfAnotherClient(db, clientId, body.workplaceId);
  const { data, error } = await db
    .from('fire_equipment')
    .insert({
      ...equipmentFields(body),
      organization_id: c.get('membership').organizationId,
      client_id: clientId,
      created_by: c.get('user').id,
    })
    .select(equipmentColumns)
    .single();
  if (error) throw fireSafetyError(error, 'create fire equipment');
  return c.json({ equipment: toEquipment(data) }, 201);
};

export const updateFireEquipment: RouteHandler<typeof updateFireEquipmentRoute, ApiEnv> = async (
  c
) => {
  const { clientId, equipmentId } = c.req.valid('param');
  const body = c.req.valid('json');
  const db = createDataClient(c);
  await findClient(db, clientId);
  await refuseWorkplaceOfAnotherClient(db, clientId, body.workplaceId);
  const { data, error } = await db
    .from('fire_equipment')
    .update(equipmentFields(body))
    .eq('id', equipmentId)
    .eq('client_id', clientId)
    .select(equipmentColumns)
    .maybeSingle();
  if (error) throw fireSafetyError(error, 'update fire equipment');
  if (!data) throw noSuchEquipment();
  return c.json({ equipment: toEquipment(data) }, 200);
};

export const deleteFireEquipment: RouteHandler<typeof deleteFireEquipmentRoute, ApiEnv> = async (
  c
) => {
  const { clientId, equipmentId } = c.req.valid('param');
  const { data, error } = await createDataClient(c)
    .from('fire_equipment')
    .delete()
    .eq('id', equipmentId)
    .eq('client_id', clientId)
    .select('id');
  if (error) throw fromDatabaseError(error, 'delete fire equipment');
  if (data.length === 0) throw noSuchEquipment();
  return c.body(null, 204);
};

const installationColumns =
  'id, client_id, workplace_id, kind, description, maintainer, last_check_on, next_check_on, created_at, updated_at';

type InstallationRow = Pick<
  Tables['fire_installations']['Row'],
  | 'id'
  | 'client_id'
  | 'workplace_id'
  | 'kind'
  | 'description'
  | 'maintainer'
  | 'last_check_on'
  | 'next_check_on'
  | 'created_at'
  | 'updated_at'
>;

const toInstallation = (row: InstallationRow): FireInstallation => ({
  id: row.id,
  clientId: row.client_id,
  workplaceId: row.workplace_id,
  kind: row.kind,
  description: row.description,
  maintainer: row.maintainer,
  lastCheckOn: row.last_check_on,
  nextCheckOn: row.next_check_on,
  createdAt: new Date(row.created_at).toISOString(),
  updatedAt: new Date(row.updated_at).toISOString(),
});

const installationFields = (body: FireInstallationRequest) => ({
  workplace_id: body.workplaceId,
  kind: body.kind,
  description: body.description ?? null,
  maintainer: body.maintainer ?? null,
  last_check_on: body.lastCheckOn ?? null,
  next_check_on: body.nextCheckOn ?? null,
});

const noSuchInstallation = () =>
  new ApiError('not_found', 'This installation does not exist under this client.');

export const listFireInstallations: RouteHandler<
  typeof listFireInstallationsRoute,
  ApiEnv
> = async (c) => {
  const { clientId } = c.req.valid('param');
  const db = createDataClient(c);
  await findClient(db, clientId);
  const workplaces = await activeWorkplaceOrder(db, clientId);
  const { data, error } = await db
    .from('fire_installations')
    .select(installationColumns)
    .eq('client_id', clientId);
  if (error) throw fromDatabaseError(error, 'list fire installations');
  const items = data
    .filter((row) => workplaces.has(row.workplace_id))
    .sort(
      (first, second) =>
        workplaces.get(first.workplace_id)! - workplaces.get(second.workplace_id)! ||
        rank(fireInstallationKinds, first.kind) - rank(fireInstallationKinds, second.kind) ||
        byText(first.description, second.description) ||
        first.created_at.localeCompare(second.created_at)
    )
    .map(toInstallation);
  return c.json({ items }, 200);
};

export const createFireInstallation: RouteHandler<
  typeof createFireInstallationRoute,
  ApiEnv
> = async (c) => {
  const { clientId } = c.req.valid('param');
  const body = c.req.valid('json');
  const db = createDataClient(c);
  await findClient(db, clientId);
  await refuseWorkplaceOfAnotherClient(db, clientId, body.workplaceId);
  const { data, error } = await db
    .from('fire_installations')
    .insert({
      ...installationFields(body),
      organization_id: c.get('membership').organizationId,
      client_id: clientId,
      created_by: c.get('user').id,
    })
    .select(installationColumns)
    .single();
  if (error) throw fireSafetyError(error, 'create fire installation');
  return c.json({ installation: toInstallation(data) }, 201);
};

export const updateFireInstallation: RouteHandler<
  typeof updateFireInstallationRoute,
  ApiEnv
> = async (c) => {
  const { clientId, installationId } = c.req.valid('param');
  const body = c.req.valid('json');
  const db = createDataClient(c);
  await findClient(db, clientId);
  await refuseWorkplaceOfAnotherClient(db, clientId, body.workplaceId);
  const { data, error } = await db
    .from('fire_installations')
    .update(installationFields(body))
    .eq('id', installationId)
    .eq('client_id', clientId)
    .select(installationColumns)
    .maybeSingle();
  if (error) throw fireSafetyError(error, 'update fire installation');
  if (!data) throw noSuchInstallation();
  return c.json({ installation: toInstallation(data) }, 200);
};

export const deleteFireInstallation: RouteHandler<
  typeof deleteFireInstallationRoute,
  ApiEnv
> = async (c) => {
  const { clientId, installationId } = c.req.valid('param');
  const { data, error } = await createDataClient(c)
    .from('fire_installations')
    .delete()
    .eq('id', installationId)
    .eq('client_id', clientId)
    .select('id');
  if (error) throw fromDatabaseError(error, 'delete fire installation');
  if (data.length === 0) throw noSuchInstallation();
  return c.body(null, 204);
};

const substanceColumns =
  'id, client_id, name, classification, quantity, physical_chemical_properties, identification_codes, health_environment_risks, protection_means, intervention_measures, extinguishing_agents, storage_place, handling, created_at, updated_at';

type SubstanceRow = Pick<
  Tables['fire_substances']['Row'],
  | 'id'
  | 'client_id'
  | 'name'
  | 'classification'
  | 'quantity'
  | 'physical_chemical_properties'
  | 'identification_codes'
  | 'health_environment_risks'
  | 'protection_means'
  | 'intervention_measures'
  | 'extinguishing_agents'
  | 'storage_place'
  | 'handling'
  | 'created_at'
  | 'updated_at'
>;

const toSubstance = (row: SubstanceRow): FireSubstance => ({
  id: row.id,
  clientId: row.client_id,
  name: row.name,
  classification: row.classification,
  quantity: row.quantity,
  physicalChemicalProperties: row.physical_chemical_properties,
  identificationCodes: row.identification_codes,
  healthEnvironmentRisks: row.health_environment_risks,
  protectionMeans: row.protection_means,
  interventionMeasures: row.intervention_measures,
  extinguishingAgents: row.extinguishing_agents,
  storagePlace: row.storage_place,
  handling: row.handling,
  createdAt: new Date(row.created_at).toISOString(),
  updatedAt: new Date(row.updated_at).toISOString(),
});

const substanceFields = (body: FireSubstanceRequest) => ({
  name: body.name,
  classification: body.classification,
  quantity: body.quantity,
  physical_chemical_properties: body.physicalChemicalProperties ?? null,
  identification_codes: body.identificationCodes ?? null,
  health_environment_risks: body.healthEnvironmentRisks ?? null,
  protection_means: body.protectionMeans ?? null,
  intervention_measures: body.interventionMeasures ?? null,
  extinguishing_agents: body.extinguishingAgents ?? null,
  storage_place: body.storagePlace ?? null,
  handling: body.handling ?? null,
});

const noSuchSubstance = () =>
  new ApiError('not_found', 'This substance does not exist under this client.');

async function substancesStateOf(db: DataClient, clientId: string) {
  const { data, error } = await db
    .from('client_fire_safety')
    .select('substances_state')
    .eq('client_id', clientId)
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'fire substances state');
  return data?.substances_state ?? 'undecided';
}

export const listFireSubstances: RouteHandler<typeof listFireSubstancesRoute, ApiEnv> = async (
  c
) => {
  const { clientId } = c.req.valid('param');
  const db = createDataClient(c);
  await findClient(db, clientId);
  const [state, entries] = await Promise.all([
    substancesStateOf(db, clientId),
    db
      .from('fire_substances')
      .select(substanceColumns)
      .eq('client_id', clientId)
      .order('sort_order')
      .order('created_at')
      .order('id'),
  ]);
  if (entries.error) throw fromDatabaseError(entries.error, 'list fire substances');
  return c.json({ state, items: entries.data.map(toSubstance) }, 200);
};

// Not an upsert, as the card's save: PostgREST's would also set the keys.
export const updateFireSubstancesState: RouteHandler<
  typeof updateFireSubstancesStateRoute,
  ApiEnv
> = async (c) => {
  const { clientId } = c.req.valid('param');
  const { state } = c.req.valid('json');
  const db = createDataClient(c);
  await findClient(db, clientId);
  const refusal = (error: { code: string }) =>
    error.code === 'SUB01'
      ? new ApiError(
          'conflict',
          'The client has dangerous substances listed; delete them before saying it uses none.',
          undefined,
          'substances_listed'
        )
      : fromDatabaseError(error, 'update fire substances state');
  const update = () =>
    db
      .from('client_fire_safety')
      .update({ substances_state: state })
      .eq('client_id', clientId)
      .select('substances_state')
      .maybeSingle();
  const respond = (saved: FireSubstancesState) => c.json({ state: saved }, 200);
  const updated = await update();
  if (updated.error) throw refusal(updated.error);
  if (updated.data) return respond(updated.data.substances_state);
  const inserted = await db
    .from('client_fire_safety')
    .insert({
      client_id: clientId,
      organization_id: c.get('membership').organizationId,
      substances_state: state,
      created_by: c.get('user').id,
    })
    .select('substances_state')
    .single();
  if (inserted.error?.code === '23505') {
    const again = await update();
    if (again.error) throw refusal(again.error);
    if (again.data) return respond(again.data.substances_state);
  }
  if (inserted.error) throw refusal(inserted.error);
  return respond(inserted.data.substances_state);
};

export const createFireSubstance: RouteHandler<typeof createFireSubstanceRoute, ApiEnv> = async (
  c
) => {
  const { clientId } = c.req.valid('param');
  const body = c.req.valid('json');
  const db = createDataClient(c);
  await findClient(db, clientId);
  const last = await db
    .from('fire_substances')
    .select('sort_order')
    .eq('client_id', clientId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (last.error) throw fromDatabaseError(last.error, 'last fire substance');
  const { data, error } = await db
    .from('fire_substances')
    .insert({
      ...substanceFields(body),
      sort_order: (last.data?.sort_order ?? -1) + 1,
      organization_id: c.get('membership').organizationId,
      client_id: clientId,
      created_by: c.get('user').id,
    })
    .select(substanceColumns)
    .single();
  if (error?.code === 'SUB02') {
    throw new ApiError(
      'conflict',
      'The client does not list its dangerous substances; say it uses some first.',
      undefined,
      'substances_not_listed'
    );
  }
  if (error) throw fromDatabaseError(error, 'create fire substance');
  return c.json({ substance: toSubstance(data) }, 201);
};

export const updateFireSubstance: RouteHandler<typeof updateFireSubstanceRoute, ApiEnv> = async (
  c
) => {
  const { clientId, substanceId } = c.req.valid('param');
  const db = createDataClient(c);
  await findClient(db, clientId);
  const { data, error } = await db
    .from('fire_substances')
    .update(substanceFields(c.req.valid('json')))
    .eq('id', substanceId)
    .eq('client_id', clientId)
    .select(substanceColumns)
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'update fire substance');
  if (!data) throw noSuchSubstance();
  return c.json({ substance: toSubstance(data) }, 200);
};

export const deleteFireSubstance: RouteHandler<typeof deleteFireSubstanceRoute, ApiEnv> = async (
  c
) => {
  const { clientId, substanceId } = c.req.valid('param');
  const { data, error } = await createDataClient(c)
    .from('fire_substances')
    .delete()
    .eq('id', substanceId)
    .eq('client_id', clientId)
    .select('id');
  if (error) throw fromDatabaseError(error, 'delete fire substance');
  if (data.length === 0) throw noSuchSubstance();
  return c.body(null, 204);
};
