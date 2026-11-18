import type { RouteHandler } from '@hono/zod-openapi';
import {
  type Client,
  type ClientAttentionFilter,
  clientConflictReasons,
  clientListFilterKeys,
  type ClientListFilters,
  type ClientListItem,
  type ClientListSortKey,
  clientSearchTerms,
  clientSortKeys,
  type ClientTrainingFilter,
  leadListFilterKeys,
  type LeadListFilters,
  leadSortKeys,
  normalizeCui,
  pageRange,
  type ServiceContractState,
} from '@ssm-usor/contracts';
import type { Context } from 'hono';

import type { Database } from '../../database.types';
import { createAdminClient } from '../../lib/admin-db';
import { adminToolsAllowed } from '../../lib/auth';
import {
  archivedClientError,
  createDataClient,
  type DataClient,
  fromDatabaseError,
} from '../../lib/db';
import type { ApiEnv } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import { clientObjectBuckets, createAdminFileStore } from '../../lib/files';
import { noticeEmployeesOverStepLater } from '../billing/employees-over-step-notices';
import { clientNotFound, requireClient } from './lookup';
import type {
  archiveClientRoute,
  createClientRoute,
  deleteClientRoute,
  getClientOwnerNotesRoute,
  getClientRoute,
  listClientsRoute,
  promoteLeadRoute,
  restoreClientRoute,
  saveClientOwnerNotesRoute,
  updateClientRoute,
} from './routes';

type ClientRow = Database['public']['Tables']['clients']['Row'];

export const clientColumns =
  'id, legal_name, cui, vat_payer, caen_code, trade_register_number, county_code, locality, address_line, legal_representative_name, declared_employee_count, current_employee_count, stage, contact_name, contact_email, contact_phone, promoted_at, created_at, updated_at, archived_at';

// The documentation fields of ADR 005 get their own routes.
type SelectedClientRow = Pick<
  ClientRow,
  | 'id'
  | 'legal_name'
  | 'cui'
  | 'vat_payer'
  | 'caen_code'
  | 'trade_register_number'
  | 'county_code'
  | 'locality'
  | 'address_line'
  | 'legal_representative_name'
  | 'declared_employee_count'
  | 'stage'
  | 'contact_name'
  | 'contact_email'
  | 'contact_phone'
  | 'promoted_at'
  | 'created_at'
  | 'updated_at'
  | 'archived_at'
  | 'current_employee_count'
>;

type ContractState = { service_contract_state?: ServiceContractState };

export function toClient(row: SelectedClientRow & ContractState): Client {
  return {
    id: row.id,
    legalName: row.legal_name,
    cui: row.cui,
    vatPayer: row.vat_payer,
    caenCode: row.caen_code,
    tradeRegisterNumber: row.trade_register_number,
    // The database constrains county codes to the shared list.
    countyCode: row.county_code as Client['countyCode'],
    locality: row.locality,
    addressLine: row.address_line,
    legalRepresentativeName: row.legal_representative_name,
    declaredEmployeeCount: row.declared_employee_count,
    // A computed field, so the generated types cannot tell it is never null.
    currentEmployeeCount: row.current_employee_count ?? 0,
    stage: row.stage,
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    promotedAt: row.promoted_at,
    serviceContractState: row.service_contract_state ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  };
}

function clientResponse(c: Context<ApiEnv>, client: Client) {
  return { client, canDelete: client.archivedAt !== null && adminToolsAllowed(c) };
}

// The policies hide leads from a specialist, which would read as an empty list or a missing
// row; this says why instead.
function requireOwnerForLeads(role: string) {
  if (role !== 'owner') {
    throw new ApiError('forbidden', 'Only an owner of the organization works with leads.');
  }
}

type SortColumn = {
  column: string;
  reversed?: boolean;
  alwaysAscending?: boolean;
  nullsLast?: boolean;
};

// The id keeps every order stable across pages.
const sortColumns: Record<ClientListSortKey, SortColumn[]> = {
  legalName: [{ column: 'legal_name' }],
  cui: [{ column: 'cui' }],
  currentEmployeeCount: [{ column: 'current_employee_count' }, { column: 'legal_name' }],
  documentation: [
    { column: 'documentation_state' },
    { column: 'documentation_issued_count' },
    { column: 'legal_name' },
  ],
  fireSafetyDocumentation: [
    { column: 'fire_safety_state' },
    { column: 'fire_safety_issued_count' },
    { column: 'legal_name' },
  ],
  training: [
    { column: 'training_rank' },
    { column: 'training_flagged_count', reversed: true },
    { column: 'legal_name' },
  ],
  nextTrainingDueOn: [
    { column: 'next_training_due_on', nullsLast: true },
    { column: 'legal_name' },
  ],
  clientSince: [{ column: 'client_since' }],
  declaredEmployeeCount: [
    { column: 'declared_employee_count', nullsLast: true },
    { column: 'legal_name' },
  ],
  // Within a state, either way, the one that reached it first leads: it has waited longest.
  serviceContractState: [
    { column: 'service_contract_state' },
    { column: 'service_contract_state_at', alwaysAscending: true },
    { column: 'legal_name' },
  ],
  createdAt: [{ column: 'created_at' }],
};

const workColumns =
  'client_since, documentation_issued_count, documentation_total_count, documentation_state, documentation_last_generated_at, fire_safety_issued_count, fire_safety_total_count, fire_safety_state, fire_safety_last_generated_at, training_employee_count, training_untrained_count, training_overdue_count, training_due_count, training_attention_count, next_training_due_on';

type WorkRow = Pick<
  Database['public']['Views']['client_list']['Row'],
  | 'client_since'
  | 'documentation_issued_count'
  | 'documentation_total_count'
  | 'documentation_state'
  | 'documentation_last_generated_at'
  | 'fire_safety_issued_count'
  | 'fire_safety_total_count'
  | 'fire_safety_state'
  | 'fire_safety_last_generated_at'
  | 'training_employee_count'
  | 'training_untrained_count'
  | 'training_overdue_count'
  | 'training_due_count'
  | 'training_attention_count'
  | 'next_training_due_on'
>;

type ListedRow = SelectedClientRow & Partial<WorkRow>;

const leadListColumns = `${clientColumns}, service_contract_state, service_contract_state_at, service_contract_return_expires_at`;

type LeadListView = Database['public']['Views']['lead_list']['Row'];

// The generated types make every column of a view nullable; these come from not-null columns of
// the client, or are never null by the view's own definition.
type RequiredLeadColumn =
  | 'id'
  | 'legal_name'
  | 'cui'
  | 'vat_payer'
  | 'stage'
  | 'created_at'
  | 'updated_at'
  | 'current_employee_count'
  | 'service_contract_state';

type LeadRow = { [Column in RequiredLeadColumn]: NonNullable<LeadListView[Column]> } & Pick<
  LeadListView,
  | 'caen_code'
  | 'trade_register_number'
  | 'county_code'
  | 'locality'
  | 'address_line'
  | 'legal_representative_name'
  | 'declared_employee_count'
  | 'contact_name'
  | 'contact_email'
  | 'contact_phone'
  | 'promoted_at'
  | 'archived_at'
  | 'service_contract_state_at'
  | 'service_contract_return_expires_at'
>;

function toLeadListItem(row: LeadRow, adminTools: boolean): ClientListItem {
  return {
    ...toClient(row),
    canDelete: row.archived_at !== null && adminTools,
    clientSince: null,
    documentation: null,
    fireSafetyDocumentation: null,
    training: null,
    serviceContractStateAt: row.service_contract_state_at,
    serviceContractReturnExpiresAt: row.service_contract_return_expires_at,
  };
}

// The generated types make every column of a view nullable.
function toClientListItem(row: ListedRow, adminTools: boolean): ClientListItem {
  return {
    ...toClient(row),
    canDelete: row.archived_at !== null && adminTools,
    serviceContractStateAt: null,
    serviceContractReturnExpiresAt: null,
    clientSince: row.client_since ?? row.created_at,
    documentation: {
      state: row.documentation_state ?? 'none',
      issuedCount: row.documentation_issued_count ?? 0,
      totalCount: row.documentation_total_count ?? 0,
      lastGeneratedAt: row.documentation_last_generated_at ?? null,
    },
    fireSafetyDocumentation: {
      state: row.fire_safety_state ?? 'none',
      issuedCount: row.fire_safety_issued_count ?? 0,
      totalCount: row.fire_safety_total_count ?? 0,
      lastGeneratedAt: row.fire_safety_last_generated_at ?? null,
    },
    training: {
      employeeCount: row.training_employee_count ?? 0,
      untrainedCount: row.training_untrained_count ?? 0,
      overdueCount: row.training_overdue_count ?? 0,
      dueCount: row.training_due_count ?? 0,
      attentionCount: row.training_attention_count ?? 0,
      nextDueOn: row.next_training_due_on ?? null,
    },
  };
}

const sortsBy = (keys: readonly ClientListSortKey[], sort: ClientListSortKey) =>
  keys.includes(sort);

const trainingMatches: Record<ClientTrainingFilter, string> = {
  untrained: 'training_untrained_count.gt.0',
  overdue: 'training_overdue_count.gt.0',
  due: 'training_due_count.gt.0',
  current: 'training_rank.eq.2',
};

const attentionMatches: Record<ClientAttentionFilter, string> = {
  documentsBehind: 'documents_behind.is.true',
  missingBasicData: 'missing_basic_data.is.true',
  signaturesPending: 'signatures_pending_count.gt.0',
  testsPending: 'tests_pending_count.gt.0',
};

type FilterableQuery<Query> = {
  in(column: string, values: readonly string[]): Query;
  or(filters: string): Query;
  eq(column: string, value: boolean): Query;
};

// The terms come lowercase and without diacritics, as the search column holds the text, and
// hold only letters and digits, which keeps PostgREST's filter syntax out of them.
function matchingEveryTerm<Query extends { ilike(column: string, pattern: string): Query }>(
  query: Query,
  column: string,
  q: string | undefined
) {
  return clientSearchTerms(q).reduce(
    (matching, term) => matching.ilike(column, `*${term}*`),
    query
  );
}

function matchingFilters<Query extends FilterableQuery<Query>>(
  query: Query,
  filters: ClientListFilters
) {
  let filtered = query;
  if (filters.documentation) filtered = filtered.in('documentation_state', filters.documentation);
  if (filters.fireSafetyDocumentation) {
    filtered = filtered.in('fire_safety_state', filters.fireSafetyDocumentation);
  }
  if (filters.training) {
    filtered = filtered.or(filters.training.map((state) => trainingMatches[state]).join(','));
  }
  if (filters.attention) {
    filtered = filtered.or(filters.attention.map((need) => attentionMatches[need]).join(','));
  }
  if (filters.county) filtered = filtered.in('county_code', filters.county);
  if (filters.contract) filtered = filtered.eq('contract_ending_within_60_days', true);
  return filtered;
}

export const listClients: RouteHandler<typeof listClientsRoute, ApiEnv> = async (c) => {
  const { page, pageSize, sort, order, status, stage, q, ...query } = c.req.valid('query');
  const filters = Object.fromEntries(
    clientListFilterKeys.flatMap((key) => (query[key] ? [[key, query[key]]] : []))
  ) as ClientListFilters;
  const leadFilters = Object.fromEntries(
    leadListFilterKeys.flatMap((key) => (query[key] ? [[key, query[key]]] : []))
  ) as LeadListFilters;
  const clientFiltered = Object.keys(filters).length > 0;
  const leadFiltered = Object.keys(leadFilters).length > 0;
  const role = c.get('membership').role;
  if (stage === 'lead') {
    requireOwnerForLeads(role);
    if (clientFiltered) {
      throw new ApiError('validation_error', 'Leads are filtered by their contract state only.');
    }
    if (!sortsBy(leadSortKeys, sort)) {
      throw new ApiError('validation_error', 'Leads are not sorted by the work on a client.');
    }
  } else {
    if (leadFiltered) {
      throw new ApiError('validation_error', 'Only leads are filtered by their contract state.');
    }
    if (!sortsBy(clientSortKeys, sort)) {
      throw new ApiError('validation_error', 'Clients are not sorted by what only a lead has.');
    }
  }
  if (filters.contract && role !== 'owner') {
    throw new ApiError('forbidden', 'Only an owner of the organization filters by contract.');
  }
  const db = createDataClient(c);
  const archived = status === 'archived' ? 'not.is' : 'is';
  // Owners only, as leads are; the contract state is what says where a lead stands.
  const leads = (columns: string, head: boolean) => {
    const listed = matchingEveryTerm(
      db
        .from('lead_list')
        .select(columns, { count: 'exact', head })
        .filter('archived_at', archived, null),
      'search_text',
      q
    );
    return leadFilters.contractState
      ? listed.in('service_contract_state', leadFilters.contractState)
      : listed;
  };
  const clients = (columns: string, head: boolean) =>
    matchingFilters(
      matchingEveryTerm(
        db
          .from('client_list')
          .select(columns, { count: 'exact', head })
          .eq('stage', stage)
          .filter('archived_at', archived, null),
        'search_text',
        q
      ),
      filters
    );
  const listed = () =>
    stage === 'lead'
      ? leads(leadListColumns, false).returns<LeadRow[]>()
      : clients(`${clientColumns}, ${workColumns}`, false).returns<ListedRow[]>();
  // Counts only, so the page past the end does not compute every row's work again.
  const counted = () => (stage === 'lead' ? leads('id', true) : clients('id', true));
  const narrowed = clientFiltered || leadFiltered || clientSearchTerms(q).length > 0;
  const everyClient = narrowed
    ? db
        .from('clients')
        .select('id', { count: 'exact', head: true })
        .eq('stage', stage)
        .filter('archived_at', archived, null)
    : null;
  let listQuery = listed();
  for (const { column, reversed, alwaysAscending, nullsLast } of sortColumns[sort]) {
    listQuery = listQuery.order(column, {
      ascending: alwaysAscending || (reversed ? order === 'desc' : order === 'asc'),
      ...(nullsLast ? { nullsFirst: false } : {}),
    });
  }
  const { from, to } = pageRange(page, pageSize);
  const [{ data, error, count }, all] = await Promise.all([
    listQuery.order('id').range(from, to),
    everyClient,
  ]);
  if (all?.error) throw fromDatabaseError(all.error, 'count clients');
  const unfilteredTotal = (total: number) => (all ? (all.count ?? 0) : total);
  if (error?.code === 'PGRST103') {
    // The page lies past the end: empty, with the real total.
    const recount = await counted();
    if (recount.error) throw fromDatabaseError(recount.error, 'count clients');
    const total = recount.count ?? 0;
    return c.json(
      { items: [], page, pageSize, total, unfilteredTotal: unfilteredTotal(total) },
      200
    );
  }
  if (error) throw fromDatabaseError(error, 'list clients');
  const adminTools = adminToolsAllowed(c);
  const total = count ?? 0;
  const items =
    stage === 'lead'
      ? (data as LeadRow[]).map((row) => toLeadListItem(row, adminTools))
      : (data as ListedRow[]).map((row) => toClientListItem(row, adminTools));
  return c.json({ items, page, pageSize, total, unfilteredTotal: unfilteredTotal(total) }, 200);
};

// Row-level security hides other organizations' clients, so a missing row is a 404
// whether the client belongs to someone else or does not exist at all.
export const getClient: RouteHandler<typeof getClientRoute, ApiEnv> = async (c) => {
  const { clientId } = c.req.valid('param');
  const db = createDataClient(c);
  const { data, error } = await db
    .from('clients')
    .select(clientColumns)
    .eq('id', clientId)
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'get client');
  if (!data) throw clientNotFound();
  return c.json(clientResponse(c, toClient(data)), 200);
};

// An archived client keeps its CUI, and the caller cannot see it in the list they came from.
// Neither can a specialist see the lead that holds one: for them the holder is not there.
async function cuiConflict(db: DataClient, cui: string) {
  const holder = await db.from('clients').select('archived_at, stage').eq('cui', cui).maybeSingle();
  if (holder.error) return fromDatabaseError(holder.error, 'find client by cui');
  if (!holder.data || (holder.data.stage === 'lead' && !holder.data.archived_at)) {
    return new ApiError(
      'conflict',
      'A lead of your organization has this CUI.',
      undefined,
      clientConflictReasons.cuiTakenByLead
    );
  }
  return holder.data.archived_at
    ? new ApiError(
        'conflict',
        'An archived client of your organization has this CUI.',
        undefined,
        clientConflictReasons.cuiTakenByArchived
      )
    : new ApiError(
        'conflict',
        'A client with this CUI already exists in your organization.',
        undefined,
        clientConflictReasons.cuiTaken
      );
}

export const createClient: RouteHandler<typeof createClientRoute, ApiEnv> = async (c) => {
  const body = c.req.valid('json');
  const membership = c.get('membership');
  if (body.stage === 'lead') requireOwnerForLeads(membership.role);
  // Validation guarantees a well-formed CUI; the prefix marks VAT registration.
  const { cui, vatPrefix } = normalizeCui(body.cui)!;
  const db = createDataClient(c);
  const { data, error } = await db
    .from('clients')
    .insert({
      organization_id: membership.organizationId,
      legal_name: body.legalName,
      cui,
      vat_payer: body.vatPayer || vatPrefix,
      caen_code: body.caenCode ?? null,
      trade_register_number: body.tradeRegisterNumber ?? null,
      county_code: body.countyCode ?? null,
      locality: body.locality ?? null,
      address_line: body.addressLine ?? null,
      legal_representative_name: body.legalRepresentativeName ?? null,
      declared_employee_count: body.declaredEmployeeCount ?? null,
      contact_name: body.contactName ?? null,
      contact_email: body.contactEmail ?? null,
      contact_phone: body.contactPhone ?? null,
      stage: body.stage,
      created_by: c.get('user').id,
    })
    .select(clientColumns)
    .single();
  if (error) {
    throw error.code === '23505'
      ? await cuiConflict(db, cui)
      : fromDatabaseError(error, 'create client');
  }
  return c.json(clientResponse(c, toClient(data)), 201);
};

export const updateClient: RouteHandler<typeof updateClientRoute, ApiEnv> = async (c) => {
  const { clientId } = c.req.valid('param');
  const body = c.req.valid('json');
  // Validation guarantees a well-formed CUI; the prefix marks VAT registration.
  const { cui, vatPrefix } = normalizeCui(body.cui)!;
  const db = createDataClient(c);
  const { data, error } = await db
    .from('clients')
    .update({
      legal_name: body.legalName,
      cui,
      vat_payer: body.vatPayer || vatPrefix,
      caen_code: body.caenCode ?? null,
      trade_register_number: body.tradeRegisterNumber ?? null,
      county_code: body.countyCode ?? null,
      locality: body.locality ?? null,
      address_line: body.addressLine ?? null,
      // A client's form no longer asks for it; what its lead declared stays.
      ...(body.declaredEmployeeCount !== undefined && {
        declared_employee_count: body.declaredEmployeeCount,
      }),
      ...(body.contactName !== undefined && { contact_name: body.contactName }),
      ...(body.contactEmail !== undefined && { contact_email: body.contactEmail }),
      ...(body.contactPhone !== undefined && { contact_phone: body.contactPhone }),
    })
    .eq('id', clientId)
    .is('archived_at', null)
    .select(clientColumns)
    .maybeSingle();
  if (error) {
    throw error.code === '23505'
      ? await cuiConflict(db, cui)
      : fromDatabaseError(error, 'update client');
  }
  if (data) return c.json(clientResponse(c, toClient(data)), 200);
  await requireClient(db, clientId);
  throw new ApiError(
    'conflict',
    'An archived client is not edited.',
    undefined,
    clientConflictReasons.clientArchived
  );
};

async function setArchived(db: DataClient, clientId: string, archived: boolean) {
  // Filtered on the state it leaves, so that a repeated call keeps the first date.
  const changing = db
    .from('clients')
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq('id', clientId);
  const changed = await (
    archived ? changing.is('archived_at', null) : changing.not('archived_at', 'is', null)
  )
    .select(clientColumns)
    .maybeSingle();
  if (changed.error)
    throw fromDatabaseError(changed.error, archived ? 'archive client' : 'restore client');
  if (changed.data) return toClient(changed.data);
  const current = await db.from('clients').select(clientColumns).eq('id', clientId).maybeSingle();
  if (current.error) throw fromDatabaseError(current.error, 'find client');
  if (!current.data) throw clientNotFound();
  return toClient(current.data);
}

export const archiveClient: RouteHandler<typeof archiveClientRoute, ApiEnv> = async (c) => {
  const { clientId } = c.req.valid('param');
  return c.json(clientResponse(c, await setArchived(createDataClient(c), clientId, true)), 200);
};

export const restoreClient: RouteHandler<typeof restoreClientRoute, ApiEnv> = async (c) => {
  const { clientId } = c.req.valid('param');
  const client = await setArchived(createDataClient(c), clientId, false);
  noticeEmployeesOverStepLater(c);
  return c.json(clientResponse(c, client), 200);
};

const clientNotArchived = () =>
  new ApiError(
    'conflict',
    'Only an archived client is deleted; archive it first.',
    undefined,
    clientConflictReasons.clientNotArchived
  );

// The function runs with the secret key, since only this route decides who may delete, so the
// client is first read as the caller: the policies decide which clients they reach.
export const deleteClient: RouteHandler<typeof deleteClientRoute, ApiEnv> = async (c) => {
  if (!adminToolsAllowed(c)) {
    throw new ApiError(
      'forbidden',
      'Only a platform administrator deletes a client in production.'
    );
  }
  const { clientId } = c.req.valid('param');
  const found = await requireClient(createDataClient(c), clientId);
  if (!found.archived_at) throw clientNotArchived();

  const deleted = await createAdminClient(c).rpc('delete_archived_client', {
    p_organization_id: c.get('membership').organizationId,
    p_client_id: clientId,
  });
  if (deleted.error?.code === 'P0002') throw clientNotFound();
  if (deleted.error?.code === 'CLA02') throw clientNotArchived();
  if (deleted.error) throw fromDatabaseError(deleted.error, 'delete client');

  // The rows are gone whatever the storage answers; an object left behind is an orphan, not a
  // reason to tell the caller the client is still there.
  const files = createAdminFileStore(c);
  for (const bucket of clientObjectBuckets) {
    const paths = deleted.data.filter((row) => row.bucket === bucket).map((row) => row.path);
    if (paths.length === 0) continue;
    await files.removeClientObjects(bucket, paths).catch(() => {
      console.error(`Objects of a deleted client left in ${bucket}: ${paths.length}`);
    });
  }
  return c.body(null, 204);
};

export const promoteLead: RouteHandler<typeof promoteLeadRoute, ApiEnv> = async (c) => {
  const { clientId } = c.req.valid('param');
  const db = createDataClient(c);
  const promoted = await db
    .from('clients')
    .update({ stage: 'client' })
    .eq('id', clientId)
    .eq('stage', 'lead')
    .is('archived_at', null)
    .select(clientColumns)
    .maybeSingle();
  if (promoted.error) throw fromDatabaseError(promoted.error, 'promote lead');
  if (promoted.data) return c.json(clientResponse(c, toClient(promoted.data)), 200);
  const current = await db.from('clients').select(clientColumns).eq('id', clientId).maybeSingle();
  if (current.error) throw fromDatabaseError(current.error, 'find client');
  if (!current.data) throw clientNotFound();
  if (current.data.stage === 'lead') throw archivedClientError();
  return c.json(clientResponse(c, toClient(current.data)), 200);
};

export const getClientOwnerNotes: RouteHandler<typeof getClientOwnerNotesRoute, ApiEnv> = async (
  c
) => {
  const { clientId } = c.req.valid('param');
  const db = createDataClient(c);
  const [client, notes] = await Promise.all([
    db.from('clients').select('id').eq('id', clientId).maybeSingle(),
    db
      .from('client_owner_notes')
      .select('body, updated_at')
      .eq('client_id', clientId)
      .maybeSingle(),
  ]);
  if (client.error) throw fromDatabaseError(client.error, 'find client');
  if (notes.error) throw fromDatabaseError(notes.error, 'get client owner notes');
  if (!client.data) throw clientNotFound();
  return c.json(
    { notes: { body: notes.data?.body ?? '', updatedAt: notes.data?.updated_at ?? null } },
    200
  );
};

export const saveClientOwnerNotes: RouteHandler<typeof saveClientOwnerNotesRoute, ApiEnv> = async (
  c
) => {
  const { clientId } = c.req.valid('param');
  const { body } = c.req.valid('json');
  const db = createDataClient(c);
  const { data, error } = await db
    .from('client_owner_notes')
    .upsert(
      {
        client_id: clientId,
        organization_id: c.get('membership').organizationId,
        body,
        updated_by: c.get('user').id,
      },
      { onConflict: 'client_id' }
    )
    .select('body, updated_at')
    .single();
  // The pair of client and organization is a foreign key: a client of someone else fails it.
  if (error?.code === '23503') throw clientNotFound();
  if (error) throw fromDatabaseError(error, 'save client owner notes');
  return c.json({ notes: { body: data.body, updatedAt: data.updated_at } }, 200);
};
