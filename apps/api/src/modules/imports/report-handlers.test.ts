import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { apiRequest } from '../../test/request';
import {
  membershipRow,
  routeUpstream,
  signedInUserRoutes,
  stubFetch,
  testEnv,
  testOrganizationId as organizationId,
  testSecretKey,
  testUser as user,
  upstreamCalls,
} from '../../test/upstream';

const importId = '6f1e2d3c-4b5a-4c6d-8e7f-9a0b1c2d3e4f';
const webhook = 'https://discord.example/api/webhooks/1/token';

const env = testEnv({
  SUPABASE_SECRET_KEY: testSecretKey,
  CORS_ORIGINS: 'http://localhost:5173',
  DISCORD_ALERTS_WEBHOOK: webhook,
  ENVIRONMENT: 'production',
});

let visible: boolean;
let partVisible: boolean;
let quiet: boolean;
let access: 'full' | 'read_only';
let status: string;
let member: string;

function mockUpstream() {
  const reported = ({ url }: { url: URL }) => {
    if (!url.searchParams.has('or')) return new Response(null, { status: 204 });
    return Response.json(quiet ? [{ id: importId, part: 'risk_evaluations' }] : []);
  };
  routeUpstream(
    {
      [new URL(webhook).pathname]: ({ url }) =>
        url.href === webhook ? new Response(null, { status: 204 }) : undefined,
      '/rest/v1/rpc/current_membership': () =>
        Response.json([membershipRow({ user_id: member, access })]),
      'GET /rest/v1/imports': () =>
        Response.json(
          visible
            ? {
                id: importId,
                kind: 'client',
                status,
                organization_id: organizationId,
                cost_usd: '0.420000',
              }
            : null
        ),
      'GET /rest/v1/import_library_parts': () =>
        Response.json(partVisible ? { part: 'risk_evaluations' } : null),
      'PATCH /rest/v1/imports': reported,
      'PATCH /rest/v1/import_library_parts': reported,
    },
    signedInUserRoutes
  );
}

const request = (path: string) => apiRequest(path, { method: 'POST' }, env);

const posts = () => upstreamCalls().filter((call) => call.url.href === webhook);
const updates = (table: string) =>
  upstreamCalls().filter(
    (call) => call.url.pathname === `/rest/v1/${table}` && call.method === 'PATCH'
  );

stubFetch();

beforeEach(() => {
  visible = true;
  partVisible = true;
  quiet = true;
  access = 'full';
  status = 'ready';
  member = user.id;
  mockUpstream();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /imports/{importId}/report', () => {
  it('records who reported and when, with the secret key, and tells support, naming no one', async () => {
    const response = await request(`/imports/${importId}/report`);

    expect(response.status).toBe(204);
    const [update] = updates('imports');
    expect(update!.secret).toBe(true);
    expect(update!.url.searchParams.get('id')).toBe(`eq.${importId}`);
    expect(update!.url.searchParams.get('or')).toMatch(
      /^\(reported_at\.is\.null,reported_at\.lt\./
    );
    expect(update!.body).toEqual({ reported_at: expect.any(String), reported_by: user.id });
    await vi.waitFor(() => expect(posts()).toHaveLength(1));
    const content = (posts()[0]!.body as { content: string }).content;
    for (const line of [
      `Import: client ${importId}`,
      `Organization: ${organizationId}`,
      `Reported by account ${user.id}`,
      'Cost: $0.42',
    ]) {
      expect(content).toContain(line);
    }
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

  it('takes a report on a confirmed import, whose client the member has already created', async () => {
    status = 'confirmed';
    const response = await request(`/imports/${importId}/report`);

    expect(response.status).toBe(204);
    expect(updates('imports')).toHaveLength(1);
    await vi.waitFor(() => expect(posts()).toHaveLength(1));
  });

  it("answers 404 for an import the member's organization cannot see, and records nothing", async () => {
    visible = false;
    const response = await request(`/imports/${importId}/report`);

    expect(response.status).toBe(404);
    const read = upstreamCalls().find((call) => call.url.pathname === '/rest/v1/imports')!;
    expect(read.secret).toBe(false);
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

  it('refuses a platform admin impersonating a member, and records and tells nothing', async () => {
    member = '9c2d4e6f-8a0b-4c1d-9e2f-3a4b5c6d7e8f';
    const whole = await request(`/imports/${importId}/report`);
    const part = await request(`/imports/${importId}/library-parts/risk_evaluations/report`);

    for (const response of [whole, part]) {
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({
        error: 'forbidden',
        reason: 'import_report_impersonated',
      });
    }
    expect(updates('imports')).toEqual([]);
    expect(updates('import_library_parts')).toEqual([]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(posts()).toEqual([]);
  });

  it('refuses a caller without a token', async () => {
    const response = await apiRequest(
      `/imports/${importId}/report`,
      { method: 'POST', token: null },
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
    expect(update!.secret).toBe(true);
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
