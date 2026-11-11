import {
  type AdminActiveImpersonation,
  type AdminImpersonation,
  adminImpersonationErrorReasons,
  type AdminImpersonationList,
  adminImpersonationListQuerySchema,
  adminImpersonationStartRequestSchema,
  type AdminMemberList,
  type AdminMemberListItem,
  adminMemberListQuerySchema,
  pageRange,
} from '@ssm-usor/contracts';
import type { Context } from 'hono';

import type { Database } from '../../database.types';
import { type AdminClient, createAdminClient } from '../../lib/admin-db';
import { createDataClient, fromDatabaseError } from '../../lib/db';
import type { ApiEnv } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import {
  endActiveImpersonation,
  impersonationColumns,
  type ImpersonationRow,
  readCurrentImpersonation,
} from '../../lib/impersonation';

type Nullable<Row, Column extends keyof Row> = Omit<Row, Column> & {
  [Key in Column]: Row[Key] | null;
};

// The generated types miss the columns a left join or an account without them leaves null.
type MemberRow = Nullable<
  Database['public']['Functions']['admin_list_members']['Returns'][number],
  'email' | 'full_name' | 'subscription_plan' | 'subscription_status' | 'last_sign_in_at'
>;
type AccountRow = Nullable<
  Database['public']['Functions']['admin_accounts']['Returns'][number],
  'email' | 'full_name' | 'organization_id' | 'organization_name' | 'role'
>;

async function membersPage(
  db: AdminClient,
  search: string | undefined,
  limit: number,
  offset: number
): Promise<MemberRow[]> {
  const { data, error } = await db.rpc('admin_list_members', {
    p_search: search,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw fromDatabaseError(error, 'list admin members');
  return data;
}

export async function listMembers(c: Context<ApiEnv>) {
  const parsed = adminMemberListQuerySchema.safeParse(c.req.query());
  if (!parsed.success) throw new ApiError('validation_error');
  const { search, page, pageSize } = parsed.data;
  const db = createAdminClient(c);
  const rows = await membersPage(db, search, pageSize, (page - 1) * pageSize);
  // A page past the end has no row to carry the total.
  const total =
    rows[0]?.total ?? (page > 1 ? ((await membersPage(db, search, 1, 0))[0]?.total ?? 0) : 0);
  return c.json({
    items: rows.map((row): AdminMemberListItem => ({
      userId: row.user_id,
      email: row.email,
      fullName: row.full_name,
      organization: { id: row.organization_id, name: row.organization_name },
      role: row.role,
      subscription:
        row.subscription_plan && row.subscription_status
          ? { plan: row.subscription_plan, status: row.subscription_status }
          : null,
      lastSignInAt: row.last_sign_in_at,
    })),
    page,
    pageSize,
    total: Number(total),
  } satisfies AdminMemberList);
}

async function accountsOf(c: Context<ApiEnv>, userIds: string[]) {
  if (userIds.length === 0) return new Map<string, AccountRow>();
  const { data, error } = await createAdminClient(c).rpc('admin_accounts', {
    p_user_ids: [...new Set(userIds)],
  });
  if (error) throw fromDatabaseError(error, 'read impersonated accounts');
  return new Map((data as AccountRow[]).map((row) => [row.user_id, row]));
}

function toImpersonation(
  row: ImpersonationRow,
  account: AccountRow | undefined
): AdminImpersonation {
  return {
    id: row.id,
    target: {
      userId: row.target_user_id,
      email: account?.email ?? null,
      fullName: account?.full_name ?? null,
      organization:
        account?.organization_id && account.organization_name
          ? { id: account.organization_id, name: account.organization_name }
          : null,
      role: account?.role ?? null,
    },
    reason: row.reason ?? '',
    startedAt: row.started_at,
    expiresAt: row.expires_at,
    endedAt: row.ended_at,
  };
}

async function withTargets(c: Context<ApiEnv>, rows: ImpersonationRow[]) {
  const accounts = await accountsOf(
    c,
    rows.map((row) => row.target_user_id)
  );
  return rows.map((row) => toImpersonation(row, accounts.get(row.target_user_id)));
}

export async function getActiveImpersonation(c: Context<ApiEnv>) {
  const row = await readCurrentImpersonation(createDataClient(c));
  const [impersonation] = row ? await withTargets(c, [row]) : [null];
  return c.json({ impersonation } satisfies AdminActiveImpersonation);
}

const constraintOf = (message: string | undefined) =>
  /violates (?:check|unique) constraint "([^"]+)"/.exec(message ?? '')?.[1];

function startRefusal(error: { code?: string | null; message?: string }) {
  if (error.code === '23505' && constraintOf(error.message) === 'impersonations_active_admin_key') {
    return new ApiError(
      'conflict',
      'Another impersonation is being started.',
      undefined,
      adminImpersonationErrorReasons.startInProgress
    );
  }
  if (error.code === 'IMS02' || error.code === '23503') {
    return new ApiError(
      'unprocessable',
      'Only a member of an organization can be impersonated.',
      undefined,
      adminImpersonationErrorReasons.targetNotMember
    );
  }
  if (error.code === '23514') {
    const constraint = constraintOf(error.message);
    if (constraint === 'impersonations_distinct_users') {
      return new ApiError(
        'unprocessable',
        'You cannot impersonate yourself.',
        undefined,
        adminImpersonationErrorReasons.targetIsSelf
      );
    }
    if (
      constraint === 'impersonations_reason_given' ||
      constraint === 'impersonations_reason_length'
    ) {
      return new ApiError('validation_error', 'A reason of up to 500 characters is required.', [
        { path: 'reason', message: 'A reason of up to 500 characters is required.' },
      ]);
    }
  }
  return fromDatabaseError(error, 'start impersonation');
}

export async function startImpersonation(c: Context<ApiEnv>) {
  const parsed = adminImpersonationStartRequestSchema.safeParse(
    await c.req.json().catch(() => undefined)
  );
  if (!parsed.success) {
    throw new ApiError(
      'validation_error',
      undefined,
      parsed.error.issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
      }))
    );
  }
  // One call ends the admin's open impersonation and starts the next in one transaction, with
  // his own token, so a refused switch leaves the open one as it was.
  const { data, error } = await createDataClient(c).rpc('start_impersonation', {
    p_target_user_id: parsed.data.targetUserId,
    p_reason: parsed.data.reason,
  });
  if (error) throw startRefusal(error);
  // The impersonation is in force by now, so a failed read of whom it names must not answer
  // that it failed.
  const accounts = await accountsOf(c, [data.target_user_id]).catch((failure: unknown) => {
    console.error(
      'Impersonated account after a start failed:',
      failure instanceof Error ? failure.message : failure
    );
    return new Map<string, AccountRow>();
  });
  return c.json(toImpersonation(data, accounts.get(data.target_user_id)), 201);
}

export async function endImpersonation(c: Context<ApiEnv>) {
  await endActiveImpersonation(createDataClient(c), c.get('user').id);
  return c.body(null, 204);
}

export async function listImpersonations(c: Context<ApiEnv>) {
  const parsed = adminImpersonationListQuerySchema.safeParse(c.req.query());
  if (!parsed.success) throw new ApiError('validation_error');
  const { page, pageSize } = parsed.data;
  const db = createDataClient(c);
  const listed = () =>
    db
      .from('impersonations')
      .select(impersonationColumns, { count: 'exact' })
      .eq('admin_user_id', c.get('user').id)
      .order('started_at', { ascending: false })
      .order('id', { ascending: false });
  const { from, to } = pageRange(page, pageSize);
  const { data, error, count } = await listed().range(from, to);
  if (error?.code === 'PGRST103') {
    // PostgREST refuses a range past the last row, and counts nothing then.
    const recount = await listed().range(0, 0);
    if (recount.error) throw fromDatabaseError(recount.error, 'count impersonations');
    return c.json({
      items: [],
      page,
      pageSize,
      total: recount.count ?? 0,
    } satisfies AdminImpersonationList);
  }
  if (error) throw fromDatabaseError(error, 'list impersonations');
  return c.json({
    items: await withTargets(c, data),
    page,
    pageSize,
    total: count ?? data.length,
  } satisfies AdminImpersonationList);
}
