import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../app';
import type { ApiEnv } from '../../lib/env';

const user = {
  id: '0f7c8d96-479c-47b3-b49e-01f4555a0221',
  email: 'specialist@example.com',
  aud: 'authenticated',
  role: 'authenticated',
  created_at: '2026-09-01T00:00:00Z',
  is_anonymous: false,
  app_metadata: { provider: 'email' },
  user_metadata: {},
};
const organizationId = '3b1d6d2a-1d4e-4d7b-9a40-8e3a7c1b2f10';
const importId = '6f1e2d3c-4b5a-4c6d-8e7f-9a0b1c2d3e4f';
const secretKey = 'sb_secret_test_key_imports';
const webhook = 'https://discord.example/api/webhooks/1/token';

const env: ApiEnv['Bindings'] = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key',
  SUPABASE_SECRET_KEY: secretKey,
  CORS_ORIGINS: 'http://localhost:5173',
  DISCORD_ALERTS_WEBHOOK: webhook,
  ENVIRONMENT: 'production',
};

type Call = { method: string; url: URL; body: unknown; admin: boolean };

const fetchMock = vi.fn<typeof fetch>();
let calls: Call[] = [];
let visible: boolean;
let partVisible: boolean;
let quiet: boolean;
let access: 'full' | 'read_only';

function mockUpstream() {
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = init?.method ?? 'GET';
    const raw = init?.body;
    const call: Call = {
      method,
      url,
      body: typeof raw === 'string' && /^[[{]/.test(raw) ? JSON.parse(raw) : raw,
      admin: new Headers(init?.headers).get('Authorization') === `Bearer ${secretKey}`,
    };
    calls.push(call);
    if (url.href === webhook) return new Response(null, { status: 204 });
    if (url.pathname === '/auth/v1/user') return Response.json(user);
    if (url.pathname === '/rest/v1/rpc/current_membership') {
      return Response.json([
        { user_id: user.id, organization_id: organizationId, role: 'specialist', access },
      ]);
    }
    const quietFilter = url.searchParams.has('or');
    if (url.pathname === '/rest/v1/imports' && method === 'GET') {
      return Response.json(
        visible
          ? {
              id: importId,
              kind: 'client',
              organization_id: organizationId,
              cost_usd: '0.420000',
            }
          : null
      );
    }
    if (url.pathname === '/rest/v1/import_library_parts' && method === 'GET') {
      return Response.json(partVisible ? { part: 'risk_evaluations' } : null);
    }
    if (
      (url.pathname === '/rest/v1/imports' || url.pathname === '/rest/v1/import_library_parts') &&
      method === 'PATCH'
    ) {
      if (!quietFilter) return new Response(null, { status: 204 });
      return Response.json(quiet ? [{ id: importId, part: 'risk_evaluations' }] : []);
    }
    throw new Error(`Unexpected upstream request: ${method} ${url}`);
  });
}

const request = (path: string) =>
  createApp().request(
    path,
    { method: 'POST', headers: { Authorization: 'Bearer user-token' } },
    env
  );

const posts = () => calls.filter((call) => call.url.href === webhook);
const updates = (table: string) =>
  calls.filter((call) => call.url.pathname === `/rest/v1/${table}` && call.method === 'PATCH');

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  calls = [];
  visible = true;
  partVisible = true;
  quiet = true;
  access = 'full';
  mockUpstream();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('POST /imports/{importId}/report', () => {
  it('records who reported and when, with the secret key, and tells support, naming no one', async () => {
    const response = await request(`/imports/${importId}/report`);

    expect(response.status).toBe(204);
    const [update] = updates('imports');
    expect(update!.admin).toBe(true);
    expect(update!.url.searchParams.get('id')).toBe(`eq.${importId}`);
    expect(update!.url.searchParams.get('or')).toMatch(
      /^\(reported_at\.is\.null,reported_at\.lt\./
    );
    expect(update!.body).toEqual({ reported_at: expect.any(String), reported_by: user.id });
    await vi.waitFor(() => expect(posts()).toHaveLength(1));
    const content = (posts()[0]!.body as { content: string }).content;
    expect(content).toBe(
      [
        '🔴 **Reported by the member** · production',
        `Import: client ${importId}`,
        `Organization: ${organizationId}`,
        `Reported by account ${user.id}`,
        'Cost: $0.42',
      ].join('\n')
    );
    expect(content).not.toContain('specialist@example.com');
  });

  it('records a report again within 10 minutes without telling support again', async () => {
    quiet = false;
    const response = await request(`/imports/${importId}/report`);

    expect(response.status).toBe(204);
    const [conditional, again] = updates('imports');
    expect(conditional!.url.searchParams.has('or')).toBe(true);
    expect(again!.url.searchParams.has('or')).toBe(false);
    expect(again!.body).toEqual({ reported_at: expect.any(String), reported_by: user.id });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(posts()).toEqual([]);
  });

  it("answers 404 for an import the member's organization cannot see, and records nothing", async () => {
    visible = false;
    const response = await request(`/imports/${importId}/report`);

    expect(response.status).toBe(404);
    const read = calls.find((call) => call.url.pathname === '/rest/v1/imports')!;
    expect(read.admin).toBe(false);
    expect(updates('imports')).toEqual([]);
    expect(posts()).toEqual([]);
  });

  it('takes a report from a read-only organization, whose data it does not change', async () => {
    access = 'read_only';
    expect((await request(`/imports/${importId}/report`)).status).toBe(204);
    expect(
      (await request(`/imports/${importId}/library-parts/risk_evaluations/report`)).status
    ).toBe(204);
    expect(updates('imports')).toHaveLength(1);
    expect(updates('import_library_parts')).toHaveLength(1);
  });

  it('refuses a caller without a token', async () => {
    const response = await createApp().request(
      `/imports/${importId}/report`,
      { method: 'POST' },
      env
    );
    expect(response.status).toBe(401);
  });
});

describe('POST /imports/{importId}/library-parts/{part}/report', () => {
  it('records the report on the part and tells support which part', async () => {
    const response = await request(`/imports/${importId}/library-parts/risk_evaluations/report`);

    expect(response.status).toBe(204);
    const [update] = updates('import_library_parts');
    expect(update!.admin).toBe(true);
    expect(update!.url.searchParams.get('import_id')).toBe(`eq.${importId}`);
    expect(update!.url.searchParams.get('part')).toBe('eq.risk_evaluations');
    expect(updates('imports')).toEqual([]);
    await vi.waitFor(() => expect(posts()).toHaveLength(1));
    expect((posts()[0]!.body as { content: string }).content).toContain(
      `Import: client ${importId}, part risk_evaluations`
    );
  });

  it('answers 404 for a part the import does not have', async () => {
    partVisible = false;
    const response = await request(`/imports/${importId}/library-parts/instructions_su/report`);

    expect(response.status).toBe(404);
    expect(updates('import_library_parts')).toEqual([]);
  });

  it('answers 400 for a part that does not exist', async () => {
    const response = await request(`/imports/${importId}/library-parts/everything/report`);
    expect(response.status).toBe(400);
  });
});
