import type { Database, Json } from '../../database.types';
import type { AdminClient } from '../../lib/admin-db';
import { fromDatabaseError } from '../../lib/db';
import type { BillingOrganization } from './oblio-documents';
import type { Usage } from './rules';

export type SubscriptionRow = Database['public']['Tables']['subscriptions']['Row'];
export type SubscriptionFields = Partial<
  Omit<
    Database['public']['Tables']['subscriptions']['Insert'],
    'organization_id' | 'created_at' | 'updated_at'
  >
>;
export type InvoiceRow = Database['public']['Tables']['billing_invoices']['Row'];

export type ChangeRecord = {
  source: 'stripe' | 'owner';
  change: string;
  reason?: string | null;
  details?: Record<string, Json | undefined>;
};

export async function loadSubscription(db: AdminClient, organizationId: string) {
  const { data, error } = await db
    .from('subscriptions')
    .select('*')
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'billing subscription');
  return data;
}

export async function organizationExists(db: AdminClient, organizationId: string) {
  const { data, error } = await db
    .from('organizations')
    .select('id')
    .eq('id', organizationId)
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'billing organization');
  return data !== null;
}

export async function findSubscriptionByCustomer(db: AdminClient, customerId: string) {
  const { data, error } = await db
    .from('subscriptions')
    .select('*')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'billing subscription by customer');
  return data;
}

const tracked = [
  'plan',
  'status',
  'trial_ends_at',
  'access_until',
  'stripe_customer_id',
  'stripe_subscription_id',
  'billing_interval',
  'price_version',
  'employee_packs',
  'extra_members',
  'current_period_end',
  'invoice_email',
  'billing_anchor_at',
  'sms_cap_factor',
] as const satisfies (keyof SubscriptionRow)[];

const sameInstant = (a: unknown, b: unknown) =>
  typeof a === 'string' && typeof b === 'string' && Date.parse(a) === Date.parse(b);

function differences(previous: SubscriptionRow | null, next: SubscriptionFields) {
  const changed: Record<string, { from: Json; to: Json }> = {};
  for (const key of tracked) {
    if (!(key in next)) continue;
    const from = (previous?.[key] ?? null) as Json;
    const to = (next[key] ?? null) as Json;
    if (from === to || sameInstant(from, to)) continue;
    changed[key] = { from, to };
  }
  return changed;
}

export async function recordChange(db: AdminClient, organizationId: string, record: ChangeRecord) {
  const { error } = await db.from('subscription_changes').insert({
    organization_id: organizationId,
    source: record.source,
    change: record.change.slice(0, 60),
    reason: record.reason?.slice(0, 500) ?? null,
    details: (record.details ?? {}) as Json,
  });
  if (error) throw fromDatabaseError(error, 'billing change log');
}

// Writes only what differs and logs it; a webhook delivered again changes nothing.
export async function saveSubscription(
  db: AdminClient,
  organizationId: string,
  previous: SubscriptionRow | null,
  next: SubscriptionFields,
  record: ChangeRecord
) {
  const changed = differences(previous, next);
  if (Object.keys(changed).length === 0) return previous;
  const write = previous
    ? db.from('subscriptions').update(next).eq('organization_id', organizationId)
    : db.from('subscriptions').insert({
        organization_id: organizationId,
        ...(next as Required<Pick<SubscriptionFields, 'plan' | 'status'>> & SubscriptionFields),
      });
  const { data, error } = await write.select('*').single();
  if (error) throw fromDatabaseError(error, 'billing subscription write');
  await recordChange(db, organizationId, {
    ...record,
    details: { ...record.details, ...changed },
  });
  return data;
}

// The first paid invoice ends the hard stop on signing codes that a plan chosen during the trial
// has (ADR 029); later payments leave it as it is.
export async function markFirstPayment(db: AdminClient, organizationId: string, paidAt: Date) {
  const { data, error } = await db
    .from('subscriptions')
    .update({ first_paid_at: paidAt.toISOString() })
    .eq('organization_id', organizationId)
    .is('first_paid_at', null)
    .select('organization_id');
  if (error) throw fromDatabaseError(error, 'billing first payment');
  return data.length > 0;
}

export async function countUsage(db: AdminClient, organizationId: string): Promise<Usage> {
  const [employees, members] = await Promise.all([
    db
      .from('employees')
      .select('id, clients!employees_client_id_fkey!inner(id)', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('status', 'active')
      .is('archived_at', null)
      .eq('clients.stage', 'client')
      .is('clients.archived_at', null),
    db
      .from('organization_members')
      .select('user_id', { count: 'exact', head: true })
      .eq('organization_id', organizationId),
  ]);
  if (employees.error) throw fromDatabaseError(employees.error, 'billing employee count');
  if (members.error) throw fromDatabaseError(members.error, 'billing member count');
  return { employees: employees.count ?? 0, members: members.count ?? 0 };
}

export type Company = Omit<BillingOrganization, 'recipientEmail' | 'cui' | 'name'> & {
  name: string | null;
  cui: string | null;
};

export async function loadCompany(db: AdminClient, organizationId: string): Promise<Company> {
  const { data, error } = await db
    .from('organizations')
    .select(
      'legal_name, cui, trade_register_number, county_code, locality, address_line, vat_payer'
    )
    .eq('id', organizationId)
    .single();
  if (error) throw fromDatabaseError(error, 'billing company');
  return {
    name: data.legal_name,
    cui: data.cui,
    registryNumber: data.trade_register_number,
    countyCode: data.county_code,
    locality: data.locality,
    addressLine: data.address_line,
    vatPayer: data.vat_payer,
  };
}

// The first owner: an organization may have several, and the invoices go to one address.
export async function ownerEmail(db: AdminClient, organizationId: string) {
  const { data, error } = await db
    .from('organization_members')
    .select('user_id')
    .eq('organization_id', organizationId)
    .eq('role', 'owner')
    .order('created_at')
    .limit(1)
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'billing owner');
  if (!data) return null;
  const user = await db.auth.admin.getUserById(data.user_id);
  if (user.error) {
    console.error(`Owner lookup failed: ${user.error.message}`);
    return null;
  }
  return user.data.user?.email ?? null;
}

export async function loadInvoice(db: AdminClient, stripeInvoiceId: string) {
  const { data, error } = await db
    .from('billing_invoices')
    .select('*')
    .eq('stripe_invoice_id', stripeInvoiceId)
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'billing invoice');
  return data;
}

export async function listInvoices(db: AdminClient, organizationId: string) {
  const { data, error } = await db
    .from('billing_invoices')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw fromDatabaseError(error, 'billing invoices');
  return data;
}

export async function insertInvoice(
  db: AdminClient,
  row: Database['public']['Tables']['billing_invoices']['Insert']
) {
  const { data, error } = await db.from('billing_invoices').insert(row).select('*').single();
  if (error) throw fromDatabaseError(error, 'billing invoice insert');
  return data;
}

export async function updateInvoice(
  db: AdminClient,
  stripeInvoiceId: string,
  changes: Database['public']['Tables']['billing_invoices']['Update']
) {
  const { data, error } = await db
    .from('billing_invoices')
    .update(changes)
    .eq('stripe_invoice_id', stripeInvoiceId)
    .select('*')
    .single();
  if (error) throw fromDatabaseError(error, 'billing invoice update');
  return data;
}
