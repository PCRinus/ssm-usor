import type { RouteHandler } from '@hono/zod-openapi';
import {
  type ClientDocumentDetails,
  normalizeCui,
  type OrganizationLegalDetails,
  type ResponsiblePerson,
  type Workplace,
} from '@ssm-usor/contracts';

import type { Database } from '../../database.types';
import { createDataClient, type DataClient, fromDatabaseError } from '../../lib/db';
import type { ApiEnv } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import type {
  archiveResponsiblePersonRoute,
  archiveWorkplaceRoute,
  createResponsiblePersonRoute,
  createWorkplaceRoute,
  getClientDocumentDetailsRoute,
  getOrganizationLegalDetailsRoute,
  listResponsiblePersonsRoute,
  listWorkplacesRoute,
  updateClientDocumentDetailsRoute,
  updateOrganizationLegalDetailsRoute,
  updateResponsiblePersonRoute,
  updateWorkplaceRoute,
} from './routes';

type Tables = Database['public']['Tables'];

const legalDetailsColumns =
  'legal_name, cui, trade_register_number, county_code, locality, address_line, legal_representative_name, legal_representative_role';

type LegalDetailsRow = Pick<
  Tables['organizations']['Row'],
  | 'legal_name'
  | 'cui'
  | 'trade_register_number'
  | 'county_code'
  | 'locality'
  | 'address_line'
  | 'legal_representative_name'
  | 'legal_representative_role'
>;

function toLegalDetails(row: LegalDetailsRow): OrganizationLegalDetails {
  return {
    legalName: row.legal_name,
    cui: row.cui,
    tradeRegisterNumber: row.trade_register_number,
    // The database constrains county codes to the shared list.
    countyCode: row.county_code as OrganizationLegalDetails['countyCode'],
    locality: row.locality,
    addressLine: row.address_line,
    legalRepresentativeName: row.legal_representative_name,
    legalRepresentativeRole: row.legal_representative_role,
  };
}

export const getOrganizationLegalDetails: RouteHandler<
  typeof getOrganizationLegalDetailsRoute,
  ApiEnv
> = async (c) => {
  // Row-level security shows a member exactly one organization: their own.
  const { data, error } = await createDataClient(c)
    .from('organizations')
    .select(legalDetailsColumns)
    .single();
  if (error) throw fromDatabaseError(error, 'organization legal details');
  return c.json({ legalDetails: toLegalDetails(data) }, 200);
};

export const updateOrganizationLegalDetails: RouteHandler<
  typeof updateOrganizationLegalDetailsRoute,
  ApiEnv
> = async (c) => {
  const body = c.req.valid('json');
  const { data, error } = await createDataClient(c)
    .from('organizations')
    .update({
      legal_name: body.legalName ?? null,
      // Validation guarantees a well-formed CUI.
      cui: body.cui ? (normalizeCui(body.cui)?.cui ?? null) : null,
      trade_register_number: body.tradeRegisterNumber ?? null,
      county_code: body.countyCode ?? null,
      locality: body.locality ?? null,
      address_line: body.addressLine ?? null,
      legal_representative_name: body.legalRepresentativeName ?? null,
      legal_representative_role: body.legalRepresentativeRole ?? null,
    })
    .eq('id', c.get('membership').organizationId)
    .select(legalDetailsColumns)
    .single();
  if (error) throw fromDatabaseError(error, 'update organization legal details');
  return c.json({ legalDetails: toLegalDetails(data) }, 200);
};

const noSuchClient = () =>
  new ApiError('not_found', 'This client does not exist in your organization.');

async function findClient(db: DataClient, clientId: string) {
  const { data, error } = await db
    .from('clients')
    .select('id, archived_at')
    .eq('id', clientId)
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'find client');
  if (!data) throw noSuchClient();
  return data;
}

async function findActiveClient(db: DataClient, clientId: string, refusal: string) {
  const client = await findClient(db, clientId);
  if (client.archived_at) throw new ApiError('conflict', refusal);
  return client;
}

const documentDetailsColumns =
  'legal_representative_name, legal_representative_role, periodic_training_minutes, administrative_training_interval_months, worker_training_interval_months, training_first_month, training_day_from, training_day_to';

type DocumentDetailsRow = Pick<
  Tables['clients']['Row'],
  | 'legal_representative_name'
  | 'legal_representative_role'
  | 'periodic_training_minutes'
  | 'administrative_training_interval_months'
  | 'worker_training_interval_months'
  | 'training_first_month'
  | 'training_day_from'
  | 'training_day_to'
>;

function toDocumentDetails(row: DocumentDetailsRow): ClientDocumentDetails {
  return {
    legalRepresentativeName: row.legal_representative_name,
    legalRepresentativeRole: row.legal_representative_role,
    periodicTrainingMinutes: row.periodic_training_minutes,
    administrativeTrainingIntervalMonths: row.administrative_training_interval_months,
    workerTrainingIntervalMonths: row.worker_training_interval_months,
    trainingFirstMonth: row.training_first_month,
    trainingDayFrom: row.training_day_from,
    trainingDayTo: row.training_day_to,
  };
}

export const getClientDocumentDetails: RouteHandler<
  typeof getClientDocumentDetailsRoute,
  ApiEnv
> = async (c) => {
  const { clientId } = c.req.valid('param');
  const { data, error } = await createDataClient(c)
    .from('clients')
    .select(documentDetailsColumns)
    .eq('id', clientId)
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'client document details');
  if (!data) throw noSuchClient();
  return c.json({ documentDetails: toDocumentDetails(data) }, 200);
};

export const updateClientDocumentDetails: RouteHandler<
  typeof updateClientDocumentDetailsRoute,
  ApiEnv
> = async (c) => {
  const { clientId } = c.req.valid('param');
  const body = c.req.valid('json');
  const { data, error } = await createDataClient(c)
    .from('clients')
    .update({
      legal_representative_name: body.legalRepresentativeName ?? null,
      legal_representative_role: body.legalRepresentativeRole ?? null,
      periodic_training_minutes: body.periodicTrainingMinutes ?? null,
      administrative_training_interval_months: body.administrativeTrainingIntervalMonths ?? null,
      worker_training_interval_months: body.workerTrainingIntervalMonths ?? null,
      training_first_month: body.trainingFirstMonth ?? null,
      training_day_from: body.trainingDayFrom ?? null,
      training_day_to: body.trainingDayTo ?? null,
    })
    .eq('id', clientId)
    .select(documentDetailsColumns)
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'update client document details');
  if (!data) throw noSuchClient();
  return c.json({ documentDetails: toDocumentDetails(data) }, 200);
};

const workplaceColumns =
  'id, client_id, name, is_registered_office, county_code, locality, address_line, created_at, updated_at';

type WorkplaceRow = Pick<
  Tables['client_workplaces']['Row'],
  | 'id'
  | 'client_id'
  | 'name'
  | 'is_registered_office'
  | 'county_code'
  | 'locality'
  | 'address_line'
  | 'created_at'
  | 'updated_at'
>;

function toWorkplace(row: WorkplaceRow): Workplace {
  return {
    id: row.id,
    clientId: row.client_id,
    name: row.name,
    isRegisteredOffice: row.is_registered_office,
    countyCode: row.county_code as Workplace['countyCode'],
    locality: row.locality,
    addressLine: row.address_line,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

const noSuchWorkplace = () =>
  new ApiError('not_found', 'This workplace does not exist under this client.');

const secondRegisteredOffice = () =>
  new ApiError('conflict', 'This client already has a registered office.');

export const listWorkplaces: RouteHandler<typeof listWorkplacesRoute, ApiEnv> = async (c) => {
  const { clientId } = c.req.valid('param');
  const db = createDataClient(c);
  await findClient(db, clientId);
  const { data, error } = await db
    .from('client_workplaces')
    .select(workplaceColumns)
    .eq('client_id', clientId)
    .is('archived_at', null)
    .order('is_registered_office', { ascending: false })
    .order('name')
    .order('id');
  if (error) throw fromDatabaseError(error, 'list workplaces');
  return c.json({ items: data.map(toWorkplace) }, 200);
};

export const createWorkplace: RouteHandler<typeof createWorkplaceRoute, ApiEnv> = async (c) => {
  const { clientId } = c.req.valid('param');
  const body = c.req.valid('json');
  const db = createDataClient(c);
  await findActiveClient(db, clientId, 'This client is archived; workplaces cannot be added.');
  const { data, error } = await db
    .from('client_workplaces')
    .insert({
      organization_id: c.get('membership').organizationId,
      client_id: clientId,
      name: body.name,
      is_registered_office: body.isRegisteredOffice,
      county_code: body.countyCode ?? null,
      locality: body.locality ?? null,
      address_line: body.addressLine ?? null,
      created_by: c.get('user').id,
    })
    .select(workplaceColumns)
    .single();
  if (error) {
    throw error.code === '23505'
      ? secondRegisteredOffice()
      : fromDatabaseError(error, 'create workplace');
  }
  return c.json({ workplace: toWorkplace(data) }, 201);
};

export const updateWorkplace: RouteHandler<typeof updateWorkplaceRoute, ApiEnv> = async (c) => {
  const { clientId, workplaceId } = c.req.valid('param');
  const body = c.req.valid('json');
  const { data, error } = await createDataClient(c)
    .from('client_workplaces')
    .update({
      name: body.name,
      is_registered_office: body.isRegisteredOffice,
      county_code: body.countyCode ?? null,
      locality: body.locality ?? null,
      address_line: body.addressLine ?? null,
    })
    .eq('id', workplaceId)
    .eq('client_id', clientId)
    .is('archived_at', null)
    .select(workplaceColumns)
    .maybeSingle();
  if (error) {
    throw error.code === '23505'
      ? secondRegisteredOffice()
      : fromDatabaseError(error, 'update workplace');
  }
  if (!data) throw noSuchWorkplace();
  return c.json({ workplace: toWorkplace(data) }, 200);
};

export const archiveWorkplace: RouteHandler<typeof archiveWorkplaceRoute, ApiEnv> = async (c) => {
  const { clientId, workplaceId } = c.req.valid('param');
  const { data, error } = await createDataClient(c)
    .from('client_workplaces')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', workplaceId)
    .eq('client_id', clientId)
    .is('archived_at', null)
    .select('id')
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'archive workplace');
  if (!data) throw noSuchWorkplace();
  return c.body(null, 204);
};

const responsiblePersonColumns =
  'id, client_id, employee_id, full_name, job_title, roles, created_at, updated_at';

type ResponsiblePersonRow = Pick<
  Tables['client_responsible_persons']['Row'],
  | 'id'
  | 'client_id'
  | 'employee_id'
  | 'full_name'
  | 'job_title'
  | 'roles'
  | 'created_at'
  | 'updated_at'
>;

function toResponsiblePerson(row: ResponsiblePersonRow): ResponsiblePerson {
  return {
    id: row.id,
    clientId: row.client_id,
    employeeId: row.employee_id,
    fullName: row.full_name,
    jobTitle: row.job_title,
    roles: row.roles,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

const noSuchResponsiblePerson = () =>
  new ApiError('not_found', 'This responsible person does not exist under this client.');

function responsiblePersonError(error: { code: string }, context: string) {
  if (error.code === '23505') {
    return new ApiError('conflict', 'This employee is already a responsible person.');
  }
  if (error.code === '23503') {
    const message = 'This employee does not belong to this client.';
    return new ApiError('validation_error', message, [{ path: 'employeeId', message }]);
  }
  return fromDatabaseError(error as Parameters<typeof fromDatabaseError>[0], context);
}

export const listResponsiblePersons: RouteHandler<
  typeof listResponsiblePersonsRoute,
  ApiEnv
> = async (c) => {
  const { clientId } = c.req.valid('param');
  const db = createDataClient(c);
  await findClient(db, clientId);
  const { data, error } = await db
    .from('client_responsible_persons')
    .select(responsiblePersonColumns)
    .eq('client_id', clientId)
    .is('archived_at', null)
    .order('full_name')
    .order('id');
  if (error) throw fromDatabaseError(error, 'list responsible persons');
  return c.json({ items: data.map(toResponsiblePerson) }, 200);
};

export const createResponsiblePerson: RouteHandler<
  typeof createResponsiblePersonRoute,
  ApiEnv
> = async (c) => {
  const { clientId } = c.req.valid('param');
  const body = c.req.valid('json');
  const db = createDataClient(c);
  await findActiveClient(
    db,
    clientId,
    'This client is archived; responsible persons cannot be added.'
  );
  const { data, error } = await db
    .from('client_responsible_persons')
    .insert({
      organization_id: c.get('membership').organizationId,
      client_id: clientId,
      employee_id: body.employeeId ?? null,
      full_name: body.fullName,
      job_title: body.jobTitle,
      roles: body.roles,
      created_by: c.get('user').id,
    })
    .select(responsiblePersonColumns)
    .single();
  if (error) throw responsiblePersonError(error, 'create responsible person');
  return c.json({ responsiblePerson: toResponsiblePerson(data) }, 201);
};

export const updateResponsiblePerson: RouteHandler<
  typeof updateResponsiblePersonRoute,
  ApiEnv
> = async (c) => {
  const { clientId, responsiblePersonId } = c.req.valid('param');
  const body = c.req.valid('json');
  const { data, error } = await createDataClient(c)
    .from('client_responsible_persons')
    .update({
      employee_id: body.employeeId ?? null,
      full_name: body.fullName,
      job_title: body.jobTitle,
      roles: body.roles,
    })
    .eq('id', responsiblePersonId)
    .eq('client_id', clientId)
    .is('archived_at', null)
    .select(responsiblePersonColumns)
    .maybeSingle();
  if (error) throw responsiblePersonError(error, 'update responsible person');
  if (!data) throw noSuchResponsiblePerson();
  return c.json({ responsiblePerson: toResponsiblePerson(data) }, 200);
};

export const archiveResponsiblePerson: RouteHandler<
  typeof archiveResponsiblePersonRoute,
  ApiEnv
> = async (c) => {
  const { clientId, responsiblePersonId } = c.req.valid('param');
  const { data, error } = await createDataClient(c)
    .from('client_responsible_persons')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', responsiblePersonId)
    .eq('client_id', clientId)
    .is('archived_at', null)
    .select('id')
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'archive responsible person');
  if (!data) throw noSuchResponsiblePerson();
  return c.body(null, 204);
};
