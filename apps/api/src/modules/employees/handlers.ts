import type { RouteHandler } from '@hono/zod-openapi';
import {
  type CreateEmployeeRequest,
  type Employee,
  type EmployeeListItem,
  type EmployeeSortKey,
  normalizeCnp,
  type OrganizationEmployeeListItem,
  type OrganizationEmployeeSortKey,
  pageRange,
  searchTerms,
  type TrainingStateFilter,
} from '@ssm-usor/contracts';

import type { Database } from '../../database.types';
import { createDataClient, type DataClient, fromDatabaseError } from '../../lib/db';
import type { ApiEnv } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import { refuseWorkplaceOfAnotherClient } from '../document-data/handlers';
import { toEmployeeTraining, type TrainingStatusRow } from '../trainings/status';
import type {
  createEmployeeRoute,
  getEmployeeRoute,
  listEmployeesRoute,
  listOrganizationEmployeesRoute,
  updateEmployeeJobPositionRoute,
  updateEmployeeRoute,
  updateEmployeeStatusRoute,
} from './routes';

type EmployeeRow = Database['public']['Tables']['employees']['Row'];

// The job position rides along by its foreign key: every employee has exactly one.
export const employeeListColumns =
  'id, client_id, last_name, first_name, employee_number, email, phone, job_title, hired_at, status, terminated_at, created_at, updated_at, job_positions(id, name), workplace_id, client_workplaces!employees_workplace_in_client(id, name), training_status(ssm_state, ssm_due_on, ssm_last_periodic_on, ssm_interval_months, ssm_interval_source, psi_state, psi_due_on, psi_last_periodic_on, psi_interval_months, psi_interval_source)';

// Inner, so that a filter on the status drops the employees it leaves out.
const employeeListColumnsFilteredByTraining = employeeListColumns.replace(
  'training_status(',
  'training_status!inner('
) as typeof employeeListColumns;

// "La zi" means up to date in both domains; every other state flags someone the specialist has
// to see to in either.
function inTrainingState<
  Q extends { or(filters: string, options: { referencedTable: string }): Q },
>(query: Q, state: TrainingStateFilter) {
  const filters =
    state === 'current'
      ? 'and(ssm_state.eq.current,psi_state.eq.current)'
      : `ssm_state.eq.${state},psi_state.eq.${state}`;
  return query.or(filters, { referencedTable: 'training_status' });
}

// The CNP and the training-sheet details are read only for one employee at a time.
export const employeeColumns = `${employeeListColumns}, cnp, birth_date, birth_place, home_address, blood_group, rh_factor, notes, archived_at, qualification, education, authorizations, commute_route, commute_minutes, contract_number`;

type EmployeeListRow = Pick<
  EmployeeRow,
  | 'id'
  | 'client_id'
  | 'last_name'
  | 'first_name'
  | 'employee_number'
  | 'email'
  | 'phone'
  | 'job_title'
  | 'hired_at'
  | 'status'
  | 'terminated_at'
  | 'created_at'
  | 'updated_at'
  | 'workplace_id'
> & {
  job_positions: { id: string; name: string };
  client_workplaces: { id: string; name: string } | null;
  training_status: TrainingStatusRow | null;
};

export function toEmployeeListItem(row: EmployeeListRow): EmployeeListItem {
  return {
    id: row.id,
    clientId: row.client_id,
    lastName: row.last_name,
    firstName: row.first_name,
    employeeNumber: row.employee_number,
    email: row.email,
    phone: row.phone,
    jobTitle: row.job_title,
    jobPosition: row.job_positions,
    hiredAt: row.hired_at,
    status: row.status,
    terminatedAt: row.terminated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    workplace: row.client_workplaces,
    training: toEmployeeTraining(row.training_status),
  };
}

export function toEmployee(
  row: Omit<
    EmployeeRow,
    | 'organization_id'
    | 'created_by'
    | 'job_position_id'
    | 'training_status'
    | 'test_status'
    | 'employee_search_name'
    | 'employee_client_search_name'
  > &
    Pick<EmployeeListRow, 'job_positions' | 'client_workplaces' | 'training_status'>
): Employee {
  return {
    ...toEmployeeListItem(row),
    cnp: row.cnp,
    birthDate: row.birth_date,
    birthPlace: row.birth_place,
    homeAddress: row.home_address,
    // The database constrains both to the shared lists.
    bloodGroup: row.blood_group as Employee['bloodGroup'],
    rhFactor: row.rh_factor as Employee['rhFactor'],
    notes: row.notes,
    archivedAt: row.archived_at,
    qualification: row.qualification,
    education: row.education,
    authorizations: row.authorizations,
    commuteRoute: row.commute_route,
    commuteMinutes: row.commute_minutes,
    contractNumber: row.contract_number,
  };
}

// Row-level security hides other organizations' clients, so a missing row is a 404
// whether the client belongs to someone else or does not exist at all.
async function findClient(db: DataClient, clientId: string) {
  const { data, error } = await db
    .from('clients')
    .select('id, archived_at')
    .eq('id', clientId)
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'find client');
  if (!data) throw new ApiError('not_found', 'This client does not exist in your organization.');
  return data;
}

// A position of another client, or an archived one, is a wrong choice on the form.
async function requireJobPosition(db: DataClient, clientId: string, jobPositionId: string) {
  const { data, error } = await db
    .from('job_positions')
    .select('id')
    .eq('id', jobPositionId)
    .eq('client_id', clientId)
    .is('archived_at', null)
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'find job position');
  if (!data) {
    throw new ApiError('validation_error', 'This job position does not exist under this client.', [
      { path: 'jobPositionId', message: 'This job position does not exist under this client.' },
    ]);
  }
}

async function onlyActiveWorkplace(db: DataClient, clientId: string) {
  const { data, error } = await db
    .from('client_workplaces')
    .select('id')
    .eq('client_id', clientId)
    .is('archived_at', null)
    .limit(2);
  if (error) throw fromDatabaseError(error, 'find workplaces');
  return data.length === 1 ? data[0]!.id : null;
}

function sheetFields(body: CreateEmployeeRequest) {
  return {
    qualification: body.qualification ?? null,
    education: body.education ?? null,
    authorizations: body.authorizations ?? null,
    commute_route: body.commuteRoute ?? null,
    commute_minutes: body.commuteMinutes ?? null,
  };
}

function conflictMessage(detail: string | undefined) {
  if (detail?.includes('employees_client_cnp_key')) {
    return 'An employee with this CNP already exists for this client.';
  }
  if (detail?.includes('employees_client_employee_number_key')) {
    return 'An employee with this number already exists for this client.';
  }
  return 'This employee conflicts with an existing one.';
}

// The id keeps every order stable across pages.
const sortColumns: Record<EmployeeSortKey, string[]> = {
  name: ['last_name', 'first_name'],
  jobTitle: ['job_title', 'last_name', 'first_name'],
  jobPosition: ['job_positions(name)', 'last_name', 'first_name'],
  hiredAt: ['hired_at', 'last_name', 'first_name'],
};

// The computed fields hold the name lowercase and without diacritics, as `searchTerms` leaves
// the terms.
const employeeSearchFields = ['employee_search_name', 'employee_number'];
const organizationEmployeeSearchFields = [...employeeSearchFields, 'employee_client_search_name'];

function matchingEveryTerm<Query extends { or: (filters: string) => Query }>(
  query: Query,
  q: string | undefined,
  fields: readonly string[]
) {
  return searchTerms(q).reduce(
    (matching, term) => matching.or(fields.map((field) => `${field}.ilike.*${term}*`).join(',')),
    query
  );
}

export const listEmployees: RouteHandler<typeof listEmployeesRoute, ApiEnv> = async (c) => {
  const { clientId } = c.req.valid('param');
  const { status, trainingState, q, page, pageSize, sort, order } = c.req.valid('query');
  const db = createDataClient(c);
  await findClient(db, clientId);
  const filtered = () => {
    const base = db
      .from('employees')
      .select(trainingState ? employeeListColumnsFilteredByTraining : employeeListColumns, {
        count: 'exact',
      });
    const trained = trainingState ? inTrainingState(base, trainingState) : base;
    const scoped = trained.eq('client_id', clientId).is('archived_at', null);
    const current = status ? scoped.eq('status', status) : scoped.neq('status', 'terminated');
    return matchingEveryTerm(current, q, employeeSearchFields);
  };
  let query = filtered();
  for (const column of sortColumns[sort])
    query = query.order(column, { ascending: order === 'asc' });
  const { from, to } = pageRange(page, pageSize);
  const { data, error, count } = await query.order('id').range(from, to);
  if (error?.code === 'PGRST103') {
    // The page lies past the end (rows left since the caller last looked): empty, real total.
    const recount = await filtered().range(0, 0);
    if (recount.error) throw fromDatabaseError(recount.error, 'count employees');
    return c.json({ items: [], page, pageSize, total: recount.count ?? 0 }, 200);
  }
  if (error) throw fromDatabaseError(error, 'list employees');
  return c.json({ items: data.map(toEmployeeListItem), page, pageSize, total: count ?? 0 }, 200);
};

export const createEmployee: RouteHandler<typeof createEmployeeRoute, ApiEnv> = async (c) => {
  const { clientId } = c.req.valid('param');
  const body = c.req.valid('json');
  const membership = c.get('membership');
  const db = createDataClient(c);
  const client = await findClient(db, clientId);
  if (client.archived_at) {
    throw new ApiError('conflict', 'This client is archived; employees cannot be added.');
  }
  if (body.jobPositionId) await requireJobPosition(db, clientId, body.jobPositionId);
  await refuseWorkplaceOfAnotherClient(db, clientId, body.workplaceId);
  const workplaceId =
    body.workplaceId === undefined ? await onlyActiveWorkplace(db, clientId) : body.workplaceId;
  const { data, error } = await db
    .from('employees')
    .insert({
      organization_id: membership.organizationId,
      client_id: clientId,
      last_name: body.lastName,
      first_name: body.firstName,
      // Validation guarantees a well-formed CNP.
      cnp: body.cnp ? normalizeCnp(body.cnp) : null,
      employee_number: body.employeeNumber ?? null,
      email: body.email ?? null,
      phone: body.phone ?? null,
      job_title: body.jobTitle,
      contract_number: body.contractNumber ?? null,
      hired_at: body.hiredAt,
      birth_date: body.birthDate ?? null,
      birth_place: body.birthPlace ?? null,
      home_address: body.homeAddress ?? null,
      blood_group: body.bloodGroup ?? null,
      rh_factor: body.rhFactor ?? null,
      notes: body.notes ?? null,
      workplace_id: workplaceId,
      ...sheetFields(body),
      created_by: c.get('user').id,
      // Left out, the database assigns the job position named like the contract title,
      // creating it if the client lacks it (ADR 006). The generated types cannot know that.
      ...(body.jobPositionId ? { job_position_id: body.jobPositionId } : {}),
    } as Database['public']['Tables']['employees']['Insert'])
    .select(employeeColumns)
    .single();
  if (error) {
    throw error.code === '23505'
      ? new ApiError('conflict', conflictMessage(error.message))
      : fromDatabaseError(error, 'create employee');
  }
  return c.json({ employee: toEmployee(data) }, 201);
};

export const getEmployee: RouteHandler<typeof getEmployeeRoute, ApiEnv> = async (c) => {
  const { clientId, employeeId } = c.req.valid('param');
  const db = createDataClient(c);
  const { data, error } = await db
    .from('employees')
    .select(employeeColumns)
    .eq('id', employeeId)
    .eq('client_id', clientId)
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'get employee');
  if (!data) throw new ApiError('not_found', 'This employee does not exist under this client.');
  return c.json({ employee: toEmployee(data) }, 200);
};

export const updateEmployeeStatus: RouteHandler<typeof updateEmployeeStatusRoute, ApiEnv> = async (
  c
) => {
  const { clientId, employeeId } = c.req.valid('param');
  const body = c.req.valid('json');
  const db = createDataClient(c);
  const current = await db
    .from('employees')
    .select('id, hired_at')
    .eq('id', employeeId)
    .eq('client_id', clientId)
    .maybeSingle();
  if (current.error) throw fromDatabaseError(current.error, 'find employee');
  if (!current.data) {
    throw new ApiError('not_found', 'This employee does not exist under this client.');
  }
  // The database enforces the same rule; checking here names the field for the form.
  if (body.status === 'terminated' && body.terminatedAt < current.data.hired_at) {
    throw new ApiError('validation_error', 'The leave date cannot precede the hire date.', [
      { path: 'terminatedAt', message: 'The leave date cannot precede the hire date.' },
    ]);
  }
  const { data, error } = await db
    .from('employees')
    .update({
      status: body.status,
      terminated_at: body.status === 'terminated' ? body.terminatedAt : null,
    })
    .eq('id', employeeId)
    .eq('client_id', clientId)
    .select(employeeColumns)
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'update employee status');
  if (!data) throw new ApiError('not_found', 'This employee does not exist under this client.');
  return c.json({ employee: toEmployee(data) }, 200);
};

export const updateEmployeeJobPosition: RouteHandler<
  typeof updateEmployeeJobPositionRoute,
  ApiEnv
> = async (c) => {
  const { clientId, employeeId } = c.req.valid('param');
  const body = c.req.valid('json');
  const db = createDataClient(c);
  await requireJobPosition(db, clientId, body.jobPositionId);
  const { data, error } = await db
    .from('employees')
    .update({
      job_position_id: body.jobPositionId,
      // The contract title only changes when the person says the contract did.
      ...(body.jobTitle ? { job_title: body.jobTitle } : {}),
    })
    .eq('id', employeeId)
    .eq('client_id', clientId)
    .select(employeeColumns)
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'update employee job position');
  if (!data) throw new ApiError('not_found', 'This employee does not exist under this client.');
  return c.json({ employee: toEmployee(data) }, 200);
};

export const updateEmployee: RouteHandler<typeof updateEmployeeRoute, ApiEnv> = async (c) => {
  const { clientId, employeeId } = c.req.valid('param');
  const body = c.req.valid('json');
  const db = createDataClient(c);
  const current = await db
    .from('employees')
    .select('id, terminated_at')
    .eq('id', employeeId)
    .eq('client_id', clientId)
    .maybeSingle();
  if (current.error) throw fromDatabaseError(current.error, 'find employee');
  if (!current.data) {
    throw new ApiError('not_found', 'This employee does not exist under this client.');
  }
  // The database enforces the same rule; checking here names the field for the form.
  if (current.data.terminated_at && body.hiredAt > current.data.terminated_at) {
    throw new ApiError('validation_error', 'The hire date cannot follow the leave date.', [
      { path: 'hiredAt', message: 'The hire date cannot follow the leave date.' },
    ]);
  }
  if (body.jobPositionId) await requireJobPosition(db, clientId, body.jobPositionId);
  await refuseWorkplaceOfAnotherClient(db, clientId, body.workplaceId);
  const { data, error } = await db
    .from('employees')
    .update({
      last_name: body.lastName,
      first_name: body.firstName,
      cnp: body.cnp ? normalizeCnp(body.cnp) : null,
      employee_number: body.employeeNumber ?? null,
      email: body.email ?? null,
      phone: body.phone ?? null,
      job_title: body.jobTitle,
      contract_number: body.contractNumber ?? null,
      ...(body.jobPositionId ? { job_position_id: body.jobPositionId } : {}),
      hired_at: body.hiredAt,
      birth_date: body.birthDate ?? null,
      birth_place: body.birthPlace ?? null,
      home_address: body.homeAddress ?? null,
      blood_group: body.bloodGroup ?? null,
      rh_factor: body.rhFactor ?? null,
      notes: body.notes ?? null,
      ...(body.workplaceId === undefined ? {} : { workplace_id: body.workplaceId }),
      ...sheetFields(body),
    })
    .eq('id', employeeId)
    .eq('client_id', clientId)
    .select(employeeColumns)
    .maybeSingle();
  if (error) {
    throw error.code === '23505'
      ? new ApiError('conflict', conflictMessage(error.message))
      : fromDatabaseError(error, 'update employee');
  }
  if (!data) throw new ApiError('not_found', 'This employee does not exist under this client.');
  return c.json({ employee: toEmployee(data) }, 200);
};

// Two foreign keys lead to clients, the plain one and the one that pins the organization.
const clientColumns = 'client:clients!employees_client_id_fkey!inner(id, legal_name)';
const organizationEmployeeListColumns = `${employeeListColumns}, ${clientColumns}` as const;
const organizationEmployeeListColumnsFilteredByTraining =
  `${employeeListColumnsFilteredByTraining}, ${clientColumns}` as typeof organizationEmployeeListColumns;

type OrganizationEmployeeListRow = EmployeeListRow & { client: { id: string; legal_name: string } };

function toOrganizationEmployeeListItem(
  row: OrganizationEmployeeListRow
): OrganizationEmployeeListItem {
  return { ...toEmployeeListItem(row), client: { id: row.client.id, name: row.client.legal_name } };
}

const organizationSortColumns: Record<OrganizationEmployeeSortKey, string[]> = {
  name: ['last_name', 'first_name'],
  client: ['client(legal_name)', 'last_name', 'first_name'],
  jobPosition: ['job_positions(name)', 'last_name', 'first_name'],
  hiredAt: ['hired_at', 'last_name', 'first_name'],
};

export const listOrganizationEmployees: RouteHandler<
  typeof listOrganizationEmployeesRoute,
  ApiEnv
> = async (c) => {
  const { status, clientId, trainingState, q, page, pageSize, sort, order } = c.req.valid('query');
  const db = createDataClient(c);
  const filtered = () => {
    const base = db
      .from('employees')
      .select(
        trainingState
          ? organizationEmployeeListColumnsFilteredByTraining
          : organizationEmployeeListColumns,
        { count: 'exact' }
      );
    let query = (trainingState ? inTrainingState(base, trainingState) : base)
      .is('archived_at', null)
      // Only an owner reads leads, and the list should not change with the role.
      .eq('client.stage', 'client')
      .is('client.archived_at', null);
    if (clientId) query = query.eq('client_id', clientId);
    query = status ? query.eq('status', status) : query.neq('status', 'terminated');
    return matchingEveryTerm(query, q, organizationEmployeeSearchFields).returns<
      OrganizationEmployeeListRow[]
    >();
  };
  let query = filtered();
  for (const column of organizationSortColumns[sort])
    query = query.order(column, { ascending: order === 'asc' });
  const { from, to } = pageRange(page, pageSize);
  const { data, error, count } = await query.order('id').range(from, to);
  if (error?.code === 'PGRST103') {
    const recount = await filtered().range(0, 0);
    if (recount.error) throw fromDatabaseError(recount.error, 'count employees');
    return c.json({ items: [], page, pageSize, total: recount.count ?? 0 }, 200);
  }
  if (error) throw fromDatabaseError(error, 'list organization employees');
  return c.json(
    { items: data.map(toOrganizationEmployeeListItem), page, pageSize, total: count ?? 0 },
    200
  );
};
