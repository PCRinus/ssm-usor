import type { RouteHandler } from '@hono/zod-openapi';
import {
  type Employee,
  type EmployeeListItem,
  type EmployeeSortKey,
  normalizeCnp,
  pageRange,
} from '@ssm-usor/contracts';

import type { Database } from '../../database.types';
import { createDataClient, type DataClient, fromDatabaseError } from '../../lib/db';
import type { ApiEnv } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import type {
  createEmployeeRoute,
  getEmployeeRoute,
  listEmployeesRoute,
  updateEmployeeStatusRoute,
} from './routes';

type EmployeeRow = Database['public']['Tables']['employees']['Row'];

export const employeeListColumns =
  'id, client_id, last_name, first_name, employee_number, email, phone, job_title, hired_at, status, terminated_at, created_at, updated_at';

// The CNP and the training-sheet details are read only for one employee at a time.
export const employeeColumns = `${employeeListColumns}, cnp, birth_date, birth_place, home_address, blood_group, rh_factor, notes, archived_at`;

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
>;

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
    hiredAt: row.hired_at,
    status: row.status,
    terminatedAt: row.terminated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toEmployee(row: Omit<EmployeeRow, 'organization_id' | 'created_by'>): Employee {
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

function conflictMessage(detail: string | undefined) {
  if (detail?.includes('employees_client_cnp_key')) {
    return 'An employee with this CNP already exists for this client.';
  }
  if (detail?.includes('employees_client_employee_number_key')) {
    return 'An employee with this number already exists for this client.';
  }
  return 'This employee conflicts with an existing one.';
}

// Sort keys map to column lists; the id keeps every order stable across pages.
const sortColumns: Record<EmployeeSortKey, string[]> = {
  name: ['last_name', 'first_name'],
  jobTitle: ['job_title', 'last_name', 'first_name'],
  hiredAt: ['hired_at', 'last_name', 'first_name'],
};

export const listEmployees: RouteHandler<typeof listEmployeesRoute, ApiEnv> = async (c) => {
  const { clientId } = c.req.valid('param');
  const { status, page, pageSize, sort, order } = c.req.valid('query');
  const db = createDataClient(c);
  await findClient(db, clientId);
  const filtered = () => {
    const base = db.from('employees').select(employeeListColumns, { count: 'exact' });
    const scoped = base.eq('client_id', clientId).is('archived_at', null);
    return status ? scoped.eq('status', status) : scoped.neq('status', 'terminated');
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
      hired_at: body.hiredAt,
      birth_date: body.birthDate ?? null,
      birth_place: body.birthPlace ?? null,
      home_address: body.homeAddress ?? null,
      blood_group: body.bloodGroup ?? null,
      rh_factor: body.rhFactor ?? null,
      notes: body.notes ?? null,
      created_by: c.get('user').id,
    })
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
