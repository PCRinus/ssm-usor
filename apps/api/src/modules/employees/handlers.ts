import type { RouteHandler } from '@hono/zod-openapi';
import {
  type ClientEmployeeListItem,
  type CreateEmployeeRequest,
  type Employee,
  type EmployeeAttentionFilter,
  employeeConflictReasons,
  employeeInviteesLimit,
  type EmployeeListFilters,
  type EmployeeListItem,
  type EmployeePortalAccess,
  type EmployeeSortKey,
  type EmployeeStatus,
  type EmployeeTrainingStateFilter,
  normalizeCnp,
  noWorkplace,
  orderedCommuteMeans,
  type OrganizationEmployeeSortKey,
  type ParticipantChannel,
  type PortalAccessState,
  type PortalLanguage,
  portalStandingOf,
  searchTerms,
  type SortOrder,
  type TestStateFilter,
  type TrainingDomain,
  trainingDomains,
} from '@ssm-usor/contracts';

import type { Database } from '../../database.types';
import { createDataClient, type DataClient, fromDatabaseError } from '../../lib/db';
import type { ApiEnv } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import { listPage, orderedBy } from '../../lib/list-page';
import { toIsoOrNull } from '../../lib/timestamps';
import { noticeEmployeesOverStepLater } from '../billing/employees-over-step-notices';
import { requireClient, requireWritableClient } from '../clients/lookup';
import { refuseWorkplaceOfAnotherClient } from '../document-data/workplaces';
import {
  testStatusColumns,
  testStatusFields,
  type TestStatusRow,
  toEmployeeTests,
} from '../tests/status';
import {
  toEmployeeTraining,
  trainingStatusColumns,
  trainingStatusFields,
  type TrainingStatusRow,
} from '../trainings/status';
import { particularsColumns, toParticulars } from './particulars';
import type {
  createEmployeeRoute,
  getEmployeeRoute,
  listEmployeeInviteesRoute,
  listEmployeesRoute,
  listOrganizationEmployeesRoute,
  updateEmployeeJobPositionRoute,
  updateEmployeeRoute,
  updateEmployeeStatusRoute,
} from './routes';
import { toTrainMatch } from './training-match';

type EmployeeRow = Database['public']['Tables']['employees']['Row'];

// The job position rides along by its foreign key: every employee has exactly one.
const employeeColumnsWithoutStatus =
  'id, client_id, last_name, first_name, employee_number, email, phone, job_title, hired_at, status, terminated_at, created_at, updated_at, job_positions(id, name, archived_at), workplace_id, client_workplaces!employees_workplace_in_client(id, name)';

export const employeeListColumns =
  `${employeeColumnsWithoutStatus}, ${trainingStatusColumns}, ${testStatusColumns}` as const;

// The CNP and the training-sheet details are read only for one employee at a time.
export const employeeColumns =
  `${employeeListColumns}, cnp, residence_address, notes, archived_at, contract_number, ${particularsColumns}` as const;

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
  job_positions: { id: string; name: string; archived_at?: string | null };
  client_workplaces: { id: string; name: string } | null;
  training_status: TrainingStatusRow | null;
  test_status: TestStatusRow | null;
};

function toEmployeeListItem(
  row: EmployeeListRow
): Omit<EmployeeListItem, 'signaturesPending' | 'dutiesAcknowledgement'> {
  return {
    id: row.id,
    clientId: row.client_id,
    lastName: row.last_name,
    firstName: row.first_name,
    employeeNumber: row.employee_number,
    email: row.email,
    phone: row.phone,
    jobTitle: row.job_title,
    jobPosition: { id: row.job_positions.id, name: row.job_positions.name },
    hiredAt: row.hired_at,
    status: row.status,
    terminatedAt: row.terminated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    workplace: row.client_workplaces,
    training: toEmployeeTraining(row.training_status),
    tests: toEmployeeTests(row.test_status),
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
    Pick<EmployeeListRow, 'job_positions' | 'client_workplaces' | 'training_status' | 'test_status'>
): Employee {
  return {
    ...toEmployeeListItem(row),
    jobPosition: {
      id: row.job_positions.id,
      name: row.job_positions.name,
      archived: Boolean(row.job_positions.archived_at),
    },
    cnp: row.cnp,
    residenceAddress: row.residence_address,
    notes: row.notes,
    archivedAt: row.archived_at,
    contractNumber: row.contract_number,
    ...toParticulars(row),
  };
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
    .eq('office_has_activity', true)
    .is('archived_at', null)
    .limit(2);
  if (error) throw fromDatabaseError(error, 'find workplaces');
  return data.length === 1 ? data[0]!.id : null;
}

function employeeFields(body: CreateEmployeeRequest) {
  return {
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
    residence_address: body.residenceAddress ?? null,
    blood_group: body.bloodGroup ?? null,
    rh_factor: body.rhFactor ?? null,
    notes: body.notes ?? null,
    qualification: body.qualification ?? null,
    education: body.education ?? null,
    authorizations: body.authorizations ?? null,
    commute_route: body.commuteRoute ?? null,
    commute_means: orderedCommuteMeans(body.commuteMeans ?? []),
    commute_means_other: body.commuteMeansOther ?? null,
    commute_minutes: body.commuteMinutes ?? null,
  };
}

function conflictError(detail: string | undefined) {
  if (detail?.includes('employees_client_cnp_key')) {
    return ApiError.conflict(
      employeeConflictReasons.cnpTaken,
      'A current employee of this client already has this CNP.'
    );
  }
  if (detail?.includes('employees_client_employee_number_key')) {
    return ApiError.conflict(
      employeeConflictReasons.numberTaken,
      'A current employee of this client already has this number.'
    );
  }
  return new ApiError('conflict', 'This employee conflicts with an existing one.');
}

const listViewColumns =
  'id, client_id, client_name, last_name, first_name, employee_number, email, phone, job_title, job_position_id, job_position_name, workplace_id, workplace_name, hired_at, status, terminated_at, created_at, updated_at, signatures_pending_count';

const portalColumns =
  'portal_state, portal_since, portal_expires_at, portal_revoked_at, portal_channel, portal_address, portal_language, portal_participant_id, portal_invitation_id, portal_administrator';

type EmployeeListView = Database['public']['Views']['employee_list']['Row'];

// The generated types make every column of a view nullable; these come from not-null columns of
// the employee, its client and its post.
type RequiredListColumn =
  | 'id'
  | 'client_id'
  | 'client_name'
  | 'last_name'
  | 'first_name'
  | 'job_title'
  | 'job_position_id'
  | 'job_position_name'
  | 'hired_at'
  | 'status'
  | 'created_at'
  | 'updated_at';

type ListViewRow = { [Column in RequiredListColumn]: NonNullable<EmployeeListView[Column]> } & Pick<
  EmployeeListView,
  | 'employee_number'
  | 'email'
  | 'phone'
  | 'workplace_id'
  | 'workplace_name'
  | 'terminated_at'
  | 'signatures_pending_count'
> &
  Partial<PortalViewColumns>;

type PortalViewColumns = Pick<
  EmployeeListView,
  | 'portal_state'
  | 'portal_since'
  | 'portal_expires_at'
  | 'portal_revoked_at'
  | 'portal_channel'
  | 'portal_address'
  | 'portal_language'
  | 'portal_participant_id'
  | 'portal_invitation_id'
  | 'portal_administrator'
>;

// The database refuses a resend inside this window (PRT05).
const RESEND_AFTER_MS = 10 * 60 * 1000;

export function toPortalAccess(row: Partial<PortalViewColumns>): EmployeePortalAccess {
  const state = (row.portal_state ?? 'none') as PortalAccessState;
  const pending = state === 'invited' || state === 'expired';
  const since = toIsoOrNull(row.portal_since);
  return {
    state,
    since: state === 'revoked' ? null : since,
    expiresAt: pending ? toIsoOrNull(row.portal_expires_at) : null,
    revokedAt: state === 'revoked' ? toIsoOrNull(row.portal_revoked_at) : null,
    resendableAt:
      pending && since ? new Date(Date.parse(since) + RESEND_AFTER_MS).toISOString() : null,
    channel: (row.portal_channel as ParticipantChannel | null) ?? null,
    address: row.portal_address ?? null,
    language: state === 'active' ? ((row.portal_language as PortalLanguage | null) ?? null) : null,
    participantId: state === 'active' ? (row.portal_participant_id ?? null) : null,
    invitationId: pending ? (row.portal_invitation_id ?? null) : null,
    administrator: state !== 'none' && state !== 'revoked' && Boolean(row.portal_administrator),
  };
}

type ListedEmployee = {
  item: EmployeeListItem;
  client: { id: string; name: string };
  row: ListViewRow;
};

// The statuses are read for the page only: they carry more than the view, which computes only
// what the list filters and sorts on.
async function listedEmployees(db: DataClient, rows: ListViewRow[]): Promise<ListedEmployee[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const [training, tests] = await Promise.all([
    db
      .from('employee_training_status')
      .select(`employee_id, ${trainingStatusFields}`)
      .in('employee_id', ids),
    db
      .from('employee_test_status')
      .select(`employee_id, ${testStatusFields}`)
      .in('employee_id', ids),
  ]);
  if (training.error) throw fromDatabaseError(training.error, 'read training status');
  if (tests.error) throw fromDatabaseError(tests.error, 'read test status');
  const trainingOf = new Map(training.data.map((row) => [row.employee_id, row]));
  const testsOf = new Map(tests.data.map((row) => [row.employee_id, row]));
  return rows.map((row) => ({
    item: {
      ...toEmployeeListItem({
        ...row,
        job_positions: { id: row.job_position_id, name: row.job_position_name },
        client_workplaces:
          row.workplace_id && row.workplace_name
            ? { id: row.workplace_id, name: row.workplace_name }
            : null,
        training_status: trainingOf.get(row.id) ?? null,
        test_status: testsOf.get(row.id) ?? null,
      }),
      signaturesPending: row.signatures_pending_count ?? 0,
      dutiesAcknowledgement: null,
    },
    client: { id: row.client_id, name: row.client_name },
    row,
  }));
}

type SortColumn = { column: string; nullsLast?: true };

const byName: SortColumn[] = [{ column: 'last_name' }, { column: 'first_name' }];

const trainingOrder = (domain: TrainingDomain): SortColumn[] => [
  { column: `${domain}_training_rank`, nullsLast: true },
  { column: `${domain}_training_due_on`, nullsLast: true },
  ...byName,
];

// The id keeps every order stable across pages. A leaver has no training state and an employee
// on the current tab no leave date, so either comes last both ways.
const sortColumns: Record<EmployeeSortKey | OrganizationEmployeeSortKey, SortColumn[]> = {
  name: byName,
  jobTitle: [{ column: 'job_title' }, ...byName],
  jobPosition: [{ column: 'job_position_name' }, ...byName],
  client: [{ column: 'client_name' }, ...byName],
  hiredAt: [{ column: 'hired_at' }, ...byName],
  portal: [{ column: 'portal_rank' }, ...byName],
  terminatedAt: [{ column: 'terminated_at', nullsLast: true }, ...byName],
  ssmTraining: trainingOrder('ssm'),
  suTraining: trainingOrder('su'),
};

type ListFilters = EmployeeListFilters & {
  jobPosition?: string[];
  workplace?: string[];
  client?: string[];
  portal?: PortalAccessState[];
};

const listFilterKeys = [
  'ssmTraining',
  'suTraining',
  'test',
  'attention',
  'jobPosition',
  'workplace',
  'client',
  'portal',
] as const satisfies readonly (keyof ListFilters)[];

const attentionMatches: Record<EmployeeAttentionFilter, string> = {
  signaturesPending: 'signatures_pending_count.gt.0',
  noPhone: 'phone.is.null',
  noEmail: 'email.is.null',
  toTrain: toTrainMatch,
  trainingDue: 'ssm_training_state.eq.due,su_training_state.eq.due',
};

const testMatches = (state: TestStateFilter) =>
  state === 'passed'
    ? 'and(ssm_test_state.eq.passed,su_test_state.eq.passed)'
    : `ssm_test_state.eq.${state},su_test_state.eq.${state}`;

const trainingStates = (filters: readonly EmployeeTrainingStateFilter[]) => [
  ...new Set(
    filters.flatMap((state) =>
      state === 'attention' ? (['untrained', 'overdue'] as const) : [state]
    )
  ),
];

// The ids are checked as uuids, which keeps PostgREST's filter syntax out of them.
function workplaceMatch(chosen: readonly string[]) {
  const ids = chosen.filter((value) => value !== noWorkplace);
  return [
    ...(chosen.includes(noWorkplace) ? ['workplace_id.is.null'] : []),
    ...(ids.length > 0 ? [`workplace_id.in.(${ids.join(',')})`] : []),
  ].join(',');
}

type FilterableQuery<Query> = {
  in(column: string, values: readonly string[]): Query;
  or(filters: string): Query;
  eq(column: string, value: string): Query;
};

function matchingFilters<Query extends FilterableQuery<Query>>(query: Query, filters: ListFilters) {
  let filtered = query;
  for (const trained of trainingDomains) {
    const chosen = filters[trained === 'ssm' ? 'ssmTraining' : 'suTraining'];
    if (chosen) filtered = filtered.in(`${trained}_training_state`, trainingStates(chosen));
  }
  if (filters.test) filtered = filtered.or(filters.test.map(testMatches).join(','));
  if (filters.attention) {
    filtered = filtered.or(filters.attention.map((need) => attentionMatches[need]).join(','));
  }
  if (filters.jobPosition) filtered = filtered.in('job_position_id', filters.jobPosition);
  if (filters.workplace) filtered = filtered.or(workplaceMatch(filters.workplace));
  if (filters.client) filtered = filtered.in('client_id', filters.client);
  if (filters.portal) filtered = filtered.in('portal_state', filters.portal);
  return filtered;
}

// The terms come lowercase and without diacritics, as the search column holds the name, and hold
// only letters and digits, which keeps PostgREST's filter syntax out of them. The CNP is never
// searched: the search sits in the address, which reaches the history and the analytics.
function matchingEveryTerm<Query extends { or: (filters: string) => Query }>(
  query: Query,
  q: string | undefined
) {
  return searchTerms(q).reduce(
    (matching, term) => matching.or(`search_name.ilike.*${term}*,employee_number.ilike.*${term}*`),
    query
  );
}

type ListRequest = {
  status?: EmployeeStatus;
  q?: string;
  page: number;
  pageSize: number;
  sort: EmployeeSortKey | OrganizationEmployeeSortKey;
  order: SortOrder;
  filters: ListFilters;
  withPortal?: boolean;
};

async function listFromView(
  db: DataClient,
  inScope: <Query extends ScopableQuery<Query>>(query: Query) => Query,
  { status, q, page, pageSize, sort, order, filters, withPortal = false }: ListRequest
) {
  const current = <Query extends ScopableQuery<Query>>(query: Query) => {
    const scoped = inScope(query).is('archived_at', null);
    return status ? scoped.eq('status', status) : scoped.neq('status', 'terminated');
  };
  const narrowed = listFilterKeys.some((key) => filters[key]) || searchTerms(q).length > 0;
  const filtered = (columns: string, options: { count: 'exact'; head?: true }) =>
    matchingEveryTerm(
      matchingFilters(current(db.from('employee_list').select(columns, options)), filters),
      q
    );
  const columns = withPortal ? `${listViewColumns}, ${portalColumns}` : listViewColumns;
  const { rows, total, unfilteredTotal } = await listPage({
    page,
    pageSize,
    rows: (from, to) =>
      orderedBy(filtered(columns, { count: 'exact' }), sortColumns[sort], order)
        .order('id')
        .range(from, to)
        .returns<ListViewRow[]>(),
    recount: () => filtered('id', { count: 'exact', head: true }),
    unfiltered: narrowed
      ? () => current(db.from('employee_list').select('id', { count: 'exact', head: true }))
      : undefined,
    what: 'employees',
  });
  return { items: await listedEmployees(db, rows), page, pageSize, total, unfilteredTotal };
}

type ScopableQuery<Query> = {
  eq(column: string, value: string): Query;
  neq(column: string, value: string): Query;
  is(column: string, value: null): Query;
};

export const listEmployees: RouteHandler<typeof listEmployeesRoute, ApiEnv> = async (c) => {
  const { clientId } = c.req.valid('param');
  const { status, q, page, pageSize, sort, order, ...filters } = c.req.valid('query');
  const db = createDataClient(c);
  const client = await requireClient(db, clientId);
  const readsStates =
    Boolean(filters.ssmTraining || filters.suTraining || filters.test) ||
    Boolean(filters.attention?.some((need) => need === 'toTrain' || need === 'trainingDue')) ||
    sort === 'ssmTraining' ||
    sort === 'suTraining';
  // The states follow the current employees of active clients alone; elsewhere they would match
  // nobody while the rows still show the state each one had.
  if (readsStates && (client.archived_at || client.stage !== 'client')) {
    throw new ApiError(
      'validation_error',
      'The employees of an archived client or a lead are not filtered or sorted by training or test state.'
    );
  }
  const { items, ...meta } = await listFromView(db, (scoped) => scoped.eq('client_id', clientId), {
    status,
    q,
    page,
    pageSize,
    sort,
    order,
    filters,
    withPortal: true,
  });
  const listed: ClientEmployeeListItem[] = items.map(({ item, row }) => ({
    ...item,
    portal: toPortalAccess(row),
  }));
  return c.json({ items: listed, ...meta }, 200);
};

type InviteeViewRow = Pick<
  EmployeeListView,
  'id' | 'last_name' | 'first_name' | 'job_position_name' | 'email' | 'phone' | 'portal_state'
>;

export const listEmployeeInvitees: RouteHandler<typeof listEmployeeInviteesRoute, ApiEnv> = async (
  c
) => {
  const { clientId } = c.req.valid('param');
  const { q, ...filters } = c.req.valid('query');
  const db = createDataClient(c);
  await requireClient(db, clientId);
  const { data, error, count } = await matchingEveryTerm(
    matchingFilters(
      db
        .from('employee_list')
        .select('id, last_name, first_name, job_position_name, email, phone, portal_state', {
          count: 'exact',
        })
        .eq('client_id', clientId)
        .is('archived_at', null)
        .eq('status', 'active'),
      filters
    ),
    q
  )
    .order('last_name')
    .order('first_name')
    .order('id')
    .limit(employeeInviteesLimit)
    .returns<InviteeViewRow[]>();
  if (error) throw fromDatabaseError(error, 'list employee invitees');
  return c.json(
    {
      items: data.map((row) => ({
        employeeId: row.id!,
        lastName: row.last_name!,
        firstName: row.first_name!,
        position: row.job_position_name ?? '',
        email: row.email,
        phone: row.phone,
        current: true,
        portal: portalStandingOf((row.portal_state ?? 'none') as PortalAccessState),
      })),
      total: count ?? data.length,
    },
    200
  );
};

export const createEmployee: RouteHandler<typeof createEmployeeRoute, ApiEnv> = async (c) => {
  const { clientId } = c.req.valid('param');
  const body = c.req.valid('json');
  const membership = c.get('membership');
  const db = createDataClient(c);
  await requireWritableClient(db, clientId);
  if (body.jobPositionId) await requireJobPosition(db, clientId, body.jobPositionId);
  await refuseWorkplaceOfAnotherClient(db, clientId, body.workplaceId, { withActivity: true });
  const workplaceId =
    body.workplaceId === undefined ? await onlyActiveWorkplace(db, clientId) : body.workplaceId;
  const { data, error } = await db
    .from('employees')
    .insert({
      organization_id: membership.organizationId,
      client_id: clientId,
      ...employeeFields(body),
      workplace_id: workplaceId,
      created_by: c.get('user').id,
      // Left out, the database assigns the job position named like the contract title,
      // creating it if the client lacks it (ADR 006). The generated types cannot know that.
      ...(body.jobPositionId ? { job_position_id: body.jobPositionId } : {}),
    } as Database['public']['Tables']['employees']['Insert'])
    .select(employeeColumns)
    .single();
  if (error) {
    throw error.code === '23505'
      ? conflictError(error.message)
      : fromDatabaseError(error, 'create employee');
  }
  noticeEmployeesOverStepLater(c);
  // A position the database creates for the insert is not yet visible to the insert's own
  // returned embed, so the employee is read again once the insert has committed.
  if (data.job_positions) return c.json({ employee: toEmployee(data) }, 201);
  const created = await db
    .from('employees')
    .select(employeeColumns)
    .eq('id', data.id)
    .eq('client_id', clientId)
    .single();
  if (created.error) throw fromDatabaseError(created.error, 'read created employee');
  return c.json({ employee: toEmployee(created.data) }, 201);
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
  if (error) {
    throw error.code === '23505'
      ? conflictError(error.message)
      : fromDatabaseError(error, 'update employee status');
  }
  if (!data) throw new ApiError('not_found', 'This employee does not exist under this client.');
  if (body.status === 'active') noticeEmployeesOverStepLater(c);
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
  await refuseWorkplaceOfAnotherClient(db, clientId, body.workplaceId, { withActivity: true });
  const { data, error } = await db
    .from('employees')
    .update({
      ...employeeFields(body),
      ...(body.jobPositionId ? { job_position_id: body.jobPositionId } : {}),
      ...(body.workplaceId === undefined ? {} : { workplace_id: body.workplaceId }),
    })
    .eq('id', employeeId)
    .eq('client_id', clientId)
    .select(employeeColumns)
    .maybeSingle();
  if (error) {
    throw error.code === '23505'
      ? conflictError(error.message)
      : fromDatabaseError(error, 'update employee');
  }
  if (!data) throw new ApiError('not_found', 'This employee does not exist under this client.');
  return c.json({ employee: toEmployee(data) }, 200);
};

export const listOrganizationEmployees: RouteHandler<
  typeof listOrganizationEmployeesRoute,
  ApiEnv
> = async (c) => {
  const { status, q, page, pageSize, sort, order, ...filters } = c.req.valid('query');
  const db = createDataClient(c);
  const { items, ...meta } = await listFromView(
    db,
    (query) => {
      // Only an owner reads leads, and the list should not change with the role.
      return query.eq('client_stage', 'client').is('client_archived_at', null);
    },
    {
      status,
      q,
      page,
      pageSize,
      sort,
      order,
      filters,
    }
  );
  return c.json({ items: items.map(({ item, client }) => ({ ...item, client })), ...meta }, 200);
};
