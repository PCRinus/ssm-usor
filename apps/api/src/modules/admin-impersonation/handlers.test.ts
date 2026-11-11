import {
  adminActiveImpersonationSchema,
  adminImpersonationListSchema,
  adminImpersonationSchema,
  adminMemberListSchema,
  apiErrorResponseSchema,
} from '@ssm-usor/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createAdminApp } from '../../admin-app';
import type { ApiEnv } from '../../lib/env';

const admin = {
  id: '0f7c8d96-479c-47b3-b49e-01f4555a0221',
  email: 'mircea@example.ro',
  aud: 'authenticated',
  role: 'authenticated',
  created_at: '2026-09-01T00:00:00Z',
  is_anonymous: false,
  app_metadata: { provider: 'email', role: 'admin' },
  user_metadata: {},
};
const member = { ...admin, app_metadata: { provider: 'email' } };

const organizationId = '3b1d6d2a-1d4e-4d7b-9a40-8e3a7c1b2f10';
const targetId = '9ae7d65f-fac5-4b57-9d9b-3e502febfd31';
const leftId = '5c2e7b1a-8d4f-4e3a-9b6c-1f0e2d3c4b5a';
const impersonationId = 'b1b1b1b1-0000-4000-8000-000000000001';
const pastId = 'b1b1b1b1-0000-4000-8000-000000000002';
const secretKey = 'sb_secret_test_key_admin_impersonation';

const env: ApiEnv['Bindings'] = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key',
  SUPABASE_SECRET_KEY: secretKey,
};

const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const token = `${encode({ alg: 'ES256', typ: 'JWT' })}.${encode({ sub: admin.id, aal: 'aal2' })}.c2ln`;

type Call = {
  method: string;
  url: URL;
  body: unknown;
  secret: boolean;
  ownToken: boolean;
  headers: Headers;
};

const memberRow = {
  user_id: targetId,
  email: 'ana@example.ro',
  full_name: 'Ana Popescu',
  organization_id: organizationId,
  organization_name: 'Protecția Muncii Expert SRL',
  role: 'owner',
  subscription_plan: 'start',
  subscription_status: 'trialing',
  last_sign_in_at: '2026-11-10T08:00:00+00:00',
  total: 3,
};

const activeRow = {
  id: impersonationId,
  target_user_id: targetId,
  reason: 'Reproduce #77',
  started_at: '2026-11-11T09:00:00.123456+00:00',
  expires_at: '2026-11-11T11:00:00.123456+00:00',
  ended_at: null,
};

const pastRow = {
  ...activeRow,
  id: pastId,
  target_user_id: leftId,
  reason: 'Reproduce #70',
  started_at: '2026-11-01T09:00:00+00:00',
  expires_at: '2026-11-01T11:00:00+00:00',
  ended_at: '2026-11-01T09:30:00+00:00',
};

const accounts: Record<string, unknown> = {
  [targetId]: {
    user_id: targetId,
    email: 'ana@example.ro',
    full_name: 'Ana Popescu',
    organization_id: organizationId,
    organization_name: 'Protecția Muncii Expert SRL',
    role: 'owner',
  },
  [leftId]: {
    user_id: leftId,
    email: 'plecat@example.ro',
    full_name: null,
    organization_id: null,
    organization_name: null,
    role: null,
  },
};

const fetchMock = vi.fn<typeof fetch>();
let calls: Call[] = [];
let user: typeof admin | typeof member = admin;
let memberRows: unknown[] = [];
let active: unknown = null;
let history: unknown[] = [];
let startError: { code: string; message: string } | null = null;

function mockUpstream() {
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = init?.method ?? 'GET';
    const headers = new Headers(init?.headers);
    const raw = init?.body;
    calls.push({
      method,
      url,
      body: typeof raw === 'string' && /^[[{]/.test(raw) ? JSON.parse(raw) : raw,
      secret: headers.get('Authorization') === `Bearer ${secretKey}`,
      ownToken: headers.get('Authorization') === `Bearer ${token}`,
      headers,
    });
    const body = calls.at(-1)!.body as Record<string, unknown>;
    const path = url.pathname;

    if (path === '/auth/v1/user') return Response.json(user);
    if (path === '/rest/v1/rpc/admin_list_members') {
      const offset = Number(body.p_offset);
      return Response.json(memberRows.slice(offset, offset + Number(body.p_limit)));
    }
    if (path === '/rest/v1/rpc/admin_accounts') {
      return Response.json(
        (body.p_user_ids as string[]).flatMap((id) => (accounts[id] ? [accounts[id]] : []))
      );
    }
    if (path === '/rest/v1/rpc/start_impersonation') {
      if (startError) return Response.json(startError, { status: 400 });
      return Response.json({
        ...activeRow,
        admin_user_id: admin.id,
        target_user_id: body.p_target_user_id,
        reason: body.p_reason,
      });
    }
    if (path === '/rest/v1/impersonations' && method === 'PATCH') {
      return new Response(null, { status: 204 });
    }
    if (path === '/rest/v1/impersonations' && method === 'GET') {
      if (url.searchParams.get('ended_at') === 'is.null') return Response.json(active);
      const from = Number(url.searchParams.get('offset') ?? 0);
      const limit = Number(url.searchParams.get('limit') ?? 1000);
      if (from >= history.length && from > 0) {
        return Response.json(
          { code: 'PGRST103', message: 'Requested range not satisfiable' },
          { status: 416 }
        );
      }
      const rows = history.slice(from, from + limit);
      return Response.json(rows, {
        headers: { 'Content-Range': `${from}-${from + rows.length - 1}/${history.length}` },
      });
    }
    throw new Error(`Unexpected upstream request: ${method} ${url}`);
  });
}

const request = (path: string, init: RequestInit = {}) =>
  createAdminApp().request(
    path,
    {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    },
    env
  );

const restCalls = () => calls.filter((call) => call.url.pathname.startsWith('/rest/'));

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  calls = [];
  user = admin;
  memberRows = [
    memberRow,
    {
      ...memberRow,
      user_id: leftId,
      full_name: null,
      subscription_plan: null,
      subscription_status: null,
      last_sign_in_at: null,
    },
    { ...memberRow, user_id: 'aaaaaaaa-0000-4000-8000-000000000003' },
  ];
  active = null;
  history = [];
  startError = null;
  mockUpstream();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('admin impersonation routes', () => {
  it.each([
    ['GET', '/admin/members'],
    ['GET', '/admin/impersonation'],
    ['POST', '/admin/impersonation'],
    ['DELETE', '/admin/impersonation'],
    ['GET', '/admin/impersonations'],
  ])(
    'refuse %s %s to a member without the admin claim before reading anything',
    async (method, path) => {
      user = member;
      const response = await request(path, { method, body: method === 'POST' ? '{}' : undefined });
      expect(response.status).toBe(403);
      expect(restCalls()).toEqual([]);
    }
  );
});

describe('GET /admin/members', () => {
  it('lists the members across organizations with the secret key, as a page with its total', async () => {
    const response = await request('/admin/members?search=%20Ana%20&page=1&pageSize=2');

    expect(response.status).toBe(200);
    const page = adminMemberListSchema.parse(await response.json());
    expect(page).toMatchObject({ page: 1, pageSize: 2, total: 3 });
    expect(page.items).toEqual([
      {
        userId: targetId,
        email: 'ana@example.ro',
        fullName: 'Ana Popescu',
        organization: { id: organizationId, name: 'Protecția Muncii Expert SRL' },
        role: 'owner',
        subscription: { plan: 'start', status: 'trialing' },
        lastSignInAt: '2026-11-10T08:00:00+00:00',
      },
      expect.objectContaining({
        userId: leftId,
        fullName: null,
        subscription: null,
        lastSignInAt: null,
      }),
    ]);
    const [rpc] = restCalls();
    expect(rpc).toMatchObject({
      secret: true,
      body: { p_search: 'Ana', p_limit: 2, p_offset: 0 },
    });
    expect(rpc!.headers.get('x-audit-actor')).toBe(admin.id);
  });

  it('counts the list again for a page past its end', async () => {
    const response = await request('/admin/members?page=5&pageSize=2');

    const page = adminMemberListSchema.parse(await response.json());
    expect(page).toMatchObject({ items: [], page: 5, total: 3 });
    expect(restCalls().map((call) => call.body)).toEqual([
      { p_limit: 2, p_offset: 8 },
      { p_limit: 1, p_offset: 0 },
    ]);
  });

  it('refuses a page size past the limit', async () => {
    const response = await request('/admin/members?pageSize=500');
    expect(response.status).toBe(400);
    expect(restCalls()).toEqual([]);
  });
});

describe('GET /admin/impersonation', () => {
  it('reads the active impersonation with the admin’s own token and names the member', async () => {
    active = activeRow;

    const response = await request('/admin/impersonation');

    expect(response.status).toBe(200);
    expect(adminActiveImpersonationSchema.parse(await response.json())).toEqual({
      impersonation: {
        id: impersonationId,
        target: {
          userId: targetId,
          email: 'ana@example.ro',
          fullName: 'Ana Popescu',
          organization: { id: organizationId, name: 'Protecția Muncii Expert SRL' },
          role: 'owner',
        },
        reason: 'Reproduce #77',
        startedAt: activeRow.started_at,
        expiresAt: activeRow.expires_at,
        endedAt: null,
      },
    });
    const [read, accountsRead] = restCalls();
    expect(read).toMatchObject({ ownToken: true, method: 'GET' });
    expect(read!.url.searchParams.get('admin_user_id')).toBe(`eq.${admin.id}`);
    expect(read!.url.searchParams.get('ended_at')).toBe('is.null');
    expect(read!.url.searchParams.get('expires_at')).toMatch(/^gt\./);
    expect(accountsRead).toMatchObject({ secret: true, body: { p_user_ids: [targetId] } });
  });

  it('answers null when none is active', async () => {
    const response = await request('/admin/impersonation');

    expect(await response.json()).toEqual({ impersonation: null });
    expect(restCalls()).toHaveLength(1);
  });
});

describe('POST /admin/impersonation', () => {
  const start = (body: unknown) =>
    request('/admin/impersonation', { method: 'POST', body: JSON.stringify(body) });

  it('switches to the member in one call with the admin’s own token', async () => {
    const response = await start({ targetUserId: targetId, reason: '  Reproduce #77  ' });

    expect(response.status).toBe(201);
    expect(adminImpersonationSchema.parse(await response.json())).toMatchObject({
      id: impersonationId,
      target: { userId: targetId, fullName: 'Ana Popescu' },
      reason: 'Reproduce #77',
      endedAt: null,
    });
    const [rpc] = restCalls();
    expect(rpc).toMatchObject({
      ownToken: true,
      url: expect.objectContaining({ pathname: '/rest/v1/rpc/start_impersonation' }),
      body: { p_target_user_id: targetId, p_reason: 'Reproduce #77' },
    });
  });

  it.each([
    [{ targetUserId: targetId, reason: '   ' }, 'reason'],
    [{ targetUserId: targetId }, 'reason'],
    [{ targetUserId: targetId, reason: 'x'.repeat(501) }, 'reason'],
    [{ targetUserId: 'not-a-uuid', reason: 'Reproduce' }, 'targetUserId'],
  ])('refuses %j before the database', async (body, path) => {
    const response = await start(body);

    expect(response.status).toBe(400);
    const error = apiErrorResponseSchema.parse(await response.json());
    expect(error.issues?.map((issue) => issue.path)).toContain(path);
    expect(restCalls()).toEqual([]);
  });

  it.each([
    [
      { code: 'IMS02', message: 'Only a member of an organization is impersonated.' },
      422,
      'target_not_member',
    ],
    [
      {
        code: '23503',
        message:
          'insert or update on table "impersonations" violates foreign key constraint "impersonations_target_user_id_fkey"',
      },
      422,
      'target_not_member',
    ],
    [
      {
        code: '23514',
        message:
          'new row for relation "impersonations" violates check constraint "impersonations_distinct_users"',
      },
      422,
      'target_is_self',
    ],
    [
      {
        code: '23514',
        message:
          'new row for relation "impersonations" violates check constraint "impersonations_reason_given"',
      },
      400,
      undefined,
    ],
    [
      {
        code: '42501',
        message: 'new row violates row-level security policy for table "impersonations"',
      },
      403,
      undefined,
    ],
  ])('words the database’s refusal %j', async (error, status, reason) => {
    startError = error;

    const response = await start({ targetUserId: targetId, reason: 'Reproduce' });

    expect(response.status).toBe(status);
    expect(apiErrorResponseSchema.parse(await response.json()).reason).toBe(reason);
  });
});

describe('DELETE /admin/impersonation', () => {
  it('ends the active impersonation with the admin’s own token', async () => {
    const response = await request('/admin/impersonation', { method: 'DELETE' });

    expect(response.status).toBe(204);
    const [update] = restCalls();
    expect(update).toMatchObject({ method: 'PATCH', ownToken: true });
    expect(update!.url.pathname).toBe('/rest/v1/impersonations');
    expect(update!.url.searchParams.get('admin_user_id')).toBe(`eq.${admin.id}`);
    expect(update!.url.searchParams.get('ended_at')).toBe('is.null');
    expect(update!.url.searchParams.get('expires_at')).toMatch(/^gt\./);
    expect(Object.keys(update!.body as object)).toEqual(['ended_at']);
  });
});

describe('GET /admin/impersonations', () => {
  it('lists the admin’s impersonations newest first, a member who left without an organization', async () => {
    history = [activeRow, pastRow];

    const response = await request('/admin/impersonations?page=1&pageSize=25');

    expect(response.status).toBe(200);
    const page = adminImpersonationListSchema.parse(await response.json());
    expect(page).toMatchObject({ page: 1, pageSize: 25, total: 2 });
    expect(page.items.map((item) => item.id)).toEqual([impersonationId, pastId]);
    expect(page.items[1]!.target).toEqual({
      userId: leftId,
      email: 'plecat@example.ro',
      fullName: null,
      organization: null,
      role: null,
    });
    const [read, accountsRead] = restCalls();
    expect(read).toMatchObject({ ownToken: true });
    expect(read!.url.searchParams.get('admin_user_id')).toBe(`eq.${admin.id}`);
    expect(read!.url.searchParams.get('order')).toBe('started_at.desc,id.desc');
    expect(accountsRead).toMatchObject({ secret: true, body: { p_user_ids: [targetId, leftId] } });
  });

  it('answers an empty page past the end with the total', async () => {
    history = [activeRow, pastRow];

    const response = await request('/admin/impersonations?page=3&pageSize=1');

    expect(adminImpersonationListSchema.parse(await response.json())).toEqual({
      items: [],
      page: 3,
      pageSize: 1,
      total: 2,
    });
  });
});
