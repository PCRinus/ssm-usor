import type { RouteHandler } from '@hono/zod-openapi';
import { type Client, normalizeCui } from '@ssm-usor/contracts';

import type { Database } from './database.types';
import { createDataClient, fromDatabaseError } from './db';
import type { ApiEnv } from './env';
import { ApiError } from './errors';
import type { createClientRoute, listClientsRoute } from './openapi';

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

export const listClients: RouteHandler<typeof listClientsRoute, ApiEnv> = async (c) => {
  const db = createDataClient(c);
  const { data, error } = await db
    .from('clients')
    .select(clientColumns)
    .is('archived_at', null)
    .order('legal_name', { ascending: true });
  if (error) throw fromDatabaseError(error, 'list clients');
  return c.json({ clients: data.map(toClient) }, 200);
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
