import type { RouteHandler } from '@hono/zod-openapi';
import { type Client, type ClientSortKey, normalizeCui, pageRange } from '@ssm-usor/contracts';

import type { Database } from '../../database.types';
import { createDataClient, fromDatabaseError } from '../../lib/db';
import type { ApiEnv } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import type { createClientRoute, getClientRoute, listClientsRoute } from './routes';

type ClientRow = Database['public']['Tables']['clients']['Row'];

export const clientColumns =
  'id, legal_name, cui, vat_payer, caen_code, trade_register_number, county_code, locality, address_line, legal_representative_name, declared_employee_count, created_at, updated_at, archived_at';

export function toClient(row: Omit<ClientRow, 'organization_id' | 'created_by'>): Client {
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  };
}

// Sort keys map to column lists; the id keeps every order stable across pages.
const sortColumns: Record<ClientSortKey, string[]> = {
  legalName: ['legal_name'],
  cui: ['cui'],
  declaredEmployeeCount: ['declared_employee_count', 'legal_name'],
};

export const listClients: RouteHandler<typeof listClientsRoute, ApiEnv> = async (c) => {
  const { page, pageSize, sort, order } = c.req.valid('query');
  const db = createDataClient(c);
  const active = () =>
    db.from('clients').select(clientColumns, { count: 'exact' }).is('archived_at', null);
  let query = active();
  for (const column of sortColumns[sort])
    query = query.order(column, { ascending: order === 'asc' });
  const { from, to } = pageRange(page, pageSize);
  const { data, error, count } = await query.order('id').range(from, to);
  if (error?.code === 'PGRST103') {
    // The page lies past the end: empty, with the real total.
    const recount = await active().range(0, 0);
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

export const createClient: RouteHandler<typeof createClientRoute, ApiEnv> = async (c) => {
  const body = c.req.valid('json');
  const membership = c.get('membership');
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
      created_by: c.get('user').id,
    })
    .select(clientColumns)
    .single();
  if (error) {
    throw error.code === '23505'
      ? new ApiError('conflict', 'A client with this CUI already exists in your organization.')
      : fromDatabaseError(error, 'create client');
  }
  return c.json({ client: toClient(data) }, 201);
};
