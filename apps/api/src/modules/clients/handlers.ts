import type { RouteHandler } from '@hono/zod-openapi';
import {
  type Client,
  clientConflictReasons,
  type ClientSortKey,
  normalizeCui,
  pageRange,
} from '@ssm-usor/contracts';

import type { Database } from '../../database.types';
import { createDataClient, type DataClient, fromDatabaseError } from '../../lib/db';
import type { ApiEnv } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import type {
  archiveClientRoute,
  createClientRoute,
  getClientOwnerNotesRoute,
  getClientRoute,
  listClientsRoute,
  restoreClientRoute,
  saveClientOwnerNotesRoute,
  updateClientRoute,
} from './routes';

type ClientRow = Database['public']['Tables']['clients']['Row'];

export const clientColumns =
  'id, legal_name, cui, vat_payer, caen_code, trade_register_number, county_code, locality, address_line, legal_representative_name, declared_employee_count, stage, contact_name, contact_email, contact_phone, promoted_at, created_at, updated_at, archived_at';

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
>;

export function toClient(row: SelectedClientRow): Client {
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
    stage: row.stage,
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    promotedAt: row.promoted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  };
}

// The policies hide leads from a specialist, which would read as an empty list or a missing
// row; this says why instead.
function requireOwnerForLeads(role: string) {
  if (role !== 'owner') {
    throw new ApiError('forbidden', 'Only an owner of the organization works with leads.');
  }
}

// The id keeps every order stable across pages.
const sortColumns: Record<ClientSortKey, string[]> = {
  legalName: ['legal_name'],
  cui: ['cui'],
  declaredEmployeeCount: ['declared_employee_count', 'legal_name'],
};

export const listClients: RouteHandler<typeof listClientsRoute, ApiEnv> = async (c) => {
  const { page, pageSize, sort, order, status, stage } = c.req.valid('query');
  if (stage === 'lead') requireOwnerForLeads(c.get('membership').role);
  const db = createDataClient(c);
  const listed = () => {
    const clients = db.from('clients').select(clientColumns, { count: 'exact' }).eq('stage', stage);
    return status === 'archived'
      ? clients.not('archived_at', 'is', null)
      : clients.is('archived_at', null);
  };
  let query = listed();
  for (const column of sortColumns[sort])
    query = query.order(column, { ascending: order === 'asc' });
  const { from, to } = pageRange(page, pageSize);
  const { data, error, count } = await query.order('id').range(from, to);
  if (error?.code === 'PGRST103') {
    // The page lies past the end: empty, with the real total.
    const recount = await listed().range(0, 0);
    if (recount.error) throw fromDatabaseError(recount.error, 'count clients');
    return c.json({ items: [], page, pageSize, total: recount.count ?? 0 }, 200);
  }
  if (error) throw fromDatabaseError(error, 'list clients');
  return c.json({ items: data.map(toClient), page, pageSize, total: count ?? 0 }, 200);
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
  if (!data) throw new ApiError('not_found', 'This client does not exist in your organization.');
  return c.json({ client: toClient(data) }, 200);
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
  return c.json({ client: toClient(data) }, 201);
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
      declared_employee_count: body.declaredEmployeeCount ?? null,
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
  if (data) return c.json({ client: toClient(data) }, 200);
  const existing = await db.from('clients').select('id').eq('id', clientId).maybeSingle();
  if (existing.error) throw fromDatabaseError(existing.error, 'find client');
  if (!existing.data) {
    throw new ApiError('not_found', 'This client does not exist in your organization.');
  }
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
  if (!current.data) {
    throw new ApiError('not_found', 'This client does not exist in your organization.');
  }
  return toClient(current.data);
}

export const archiveClient: RouteHandler<typeof archiveClientRoute, ApiEnv> = async (c) => {
  const { clientId } = c.req.valid('param');
  return c.json({ client: await setArchived(createDataClient(c), clientId, true) }, 200);
};

export const restoreClient: RouteHandler<typeof restoreClientRoute, ApiEnv> = async (c) => {
  const { clientId } = c.req.valid('param');
  return c.json({ client: await setArchived(createDataClient(c), clientId, false) }, 200);
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
  if (!client.data) {
    throw new ApiError('not_found', 'This client does not exist in your organization.');
  }
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
  if (error?.code === '23503') {
    throw new ApiError('not_found', 'This client does not exist in your organization.');
  }
  if (error) throw fromDatabaseError(error, 'save client owner notes');
  return c.json({ notes: { body: data.body, updatedAt: data.updated_at } }, 200);
};
