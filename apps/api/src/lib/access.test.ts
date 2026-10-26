import { apiErrorResponseSchema } from '@ssm-usor/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../app';
import type { ApiEnv } from './env';

const env: ApiEnv['Bindings'] = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key',
};

const user = { id: '0f7c8d96-479c-47b3-b49e-01f4555a0221', email: 'ana@example.ro' };
const organizationId = '4d1c2a9e-7b3f-4e8a-9c5d-2f6b8a0e1c3d';
const participantId = '5c2a1b3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

const fetchMock = vi.fn<typeof fetch>();

function mockUpstream(access: 'full' | 'read_only') {
  fetchMock.mockImplementation(async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    switch (url.pathname) {
      case '/auth/v1/user':
        return Response.json({ ...user, is_anonymous: false, email_confirmed_at: '2026-09-01' });
      case '/rest/v1/rpc/current_membership':
        return Response.json([
          { user_id: user.id, organization_id: organizationId, role: 'owner', access },
        ]);
      case '/rest/v1/rpc/accept_participant_invitations':
        return Response.json(0);
      case '/rest/v1/rpc/current_participations':
        return Response.json([
          {
            participant_id: participantId,
            organization_id: organizationId,
            organization_name: 'Protect SSM',
            client_id: '6d3b2c4e-5f6a-4b7c-9d8e-0f1a2b3c4d5e',
            client_name: 'Client SRL',
            kind: 'employee',
            employee_id: '7e4c3d5f-6a7b-4c8d-8e9f-1a2b3c4d5e6f',
            full_name: 'Ion Pop',
            notice_version: '2026-10-17',
            language: null,
            access,
          },
        ]);
      default:
        return Response.json({ message: 'not mocked' }, { status: 599 });
    }
  });
}

const request = (path: string, method: string, body?: unknown) =>
  createApp().request(
    path,
    {
      method,
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    env
  );

const upstreamPaths = () => fetchMock.mock.calls.map(([input]) => new URL(String(input)).pathname);

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('read-only access', () => {
  it("refuses a member's change before anything is written", async () => {
    mockUpstream('read_only');

    const response = await request('/clients', 'POST', { legalName: 'Nou SRL' });

    expect(response.status).toBe(403);
    expect(apiErrorResponseSchema.parse(await response.json()).reason).toBe('read_only');
    expect(upstreamPaths()).toEqual(['/auth/v1/user', '/rest/v1/rpc/current_membership']);
  });

  it('lets a full-access member through to the handler', async () => {
    mockUpstream('full');

    const response = await request('/clients', 'POST', { legalName: 'Nou SRL' });

    expect(response.status).not.toBe(403);
  });

  it('lets a read-only member read', async () => {
    mockUpstream('read_only');

    await request('/clients', 'GET');

    expect(upstreamPaths()).toContain('/rest/v1/client_list');
  });

  it("refuses a participant's signing while the organization is read-only", async () => {
    mockUpstream('read_only');

    const response = await request(
      `/portal/participants/${participantId}/signing-sessions`,
      'POST',
      {}
    );

    expect(response.status).toBe(403);
    expect(apiErrorResponseSchema.parse(await response.json()).reason).toBe('read_only');
  });

  it("still takes a participant's acceptance of the notice", async () => {
    mockUpstream('read_only');

    const response = await request(`/portal/participants/${participantId}/notice`, 'POST', {
      version: '2026-10-17',
    });

    expect(response.status).not.toBe(403);
  });
});
