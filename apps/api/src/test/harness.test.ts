import { clientContractHeader } from '@ssm-usor/contracts';
import { describe, expect, it } from 'vitest';

import { apiRequest, testAccessToken } from './request';
import {
  callsTo,
  fetchMock,
  membershipRow,
  mockUpstream,
  stubFetch,
  testOrganizationId,
  testSecretKey,
  testUser,
} from './upstream';

stubFetch();

describe('mockUpstream', () => {
  it('answers the signed-in user and a writable membership unless a layer replaces them', async () => {
    mockUpstream();

    const user = await (await fetch('https://example.supabase.co/auth/v1/user')).json();
    const membership = await (
      await fetch('https://example.supabase.co/rest/v1/rpc/current_membership', { method: 'POST' })
    ).json();

    expect(user).toEqual(testUser);
    expect(membership).toEqual([
      {
        user_id: testUser.id,
        organization_id: testOrganizationId,
        role: 'specialist',
        access: 'full',
      },
    ]);
  });

  it('lets an earlier layer win, even a bare path over a later layer’s method route', async () => {
    mockUpstream(
      { '/rest/v1/clients': () => ['test'] },
      { 'GET /rest/v1/clients': () => ['module'], 'GET /rest/v1/employees': () => ['module'] }
    );

    expect(await (await fetch('https://example.supabase.co/rest/v1/clients')).json()).toEqual([
      'test',
    ]);
    expect(await (await fetch('https://example.supabase.co/rest/v1/employees')).json()).toEqual([
      'module',
    ]);
  });

  it('answers one object when supabase-js asks for one', async () => {
    mockUpstream({ '/rest/v1/clients': () => [{ id: 'a' }, { id: 'b' }] });

    const one = await fetch('https://example.supabase.co/rest/v1/clients', {
      headers: { Accept: 'application/vnd.pgrst.object+json' },
    });
    const none = await fetch('https://example.supabase.co/rest/v1/clients', {
      headers: { Accept: 'application/vnd.pgrst.object+json' },
    });

    expect(await one.json()).toEqual({ id: 'a' });
    expect(none.status).toBe(200);
  });

  it('refuses a request no layer routes', async () => {
    mockUpstream();

    await expect(fetch('https://example.supabase.co/rest/v1/clients')).rejects.toThrow(
      'Unexpected upstream request: GET https://example.supabase.co/rest/v1/clients'
    );
  });

  it('records each call with its parsed body and whether it used the secret key', async () => {
    mockUpstream({ 'POST /rest/v1/clients': () => new Response(null, { status: 201 }) });

    await fetch('https://example.supabase.co/rest/v1/clients', {
      method: 'POST',
      headers: { Authorization: `Bearer ${testSecretKey}` },
      body: JSON.stringify({ name: 'Ana' }),
    });
    await fetch('https://example.supabase.co/rest/v1/clients', { method: 'POST', body: 'a=b' });

    const calls = callsTo('/rest/v1/clients', 'POST');
    expect(calls.map(({ body, secret }) => ({ body, secret }))).toEqual([
      { body: { name: 'Ana' }, secret: true },
      { body: 'a=b', secret: false },
    ]);
    expect(callsTo('/rest/v1/clients', 'GET')).toEqual([]);
  });

  it('reads the method and URL of a Request', async () => {
    mockUpstream({ 'DELETE /rest/v1/clients': () => new Response(null, { status: 204 }) });

    await fetch(new Request('https://example.supabase.co/rest/v1/clients', { method: 'DELETE' }));

    expect(callsTo('/rest/v1/clients', 'DELETE')).toHaveLength(1);
  });
});

describe('membershipRow', () => {
  it('takes the role and access a test needs', () => {
    expect(membershipRow({ role: 'owner', access: 'read_only' })).toMatchObject({
      role: 'owner',
      access: 'read_only',
    });
  });
});

describe('apiRequest', () => {
  it('sends the access token and the current app contract', async () => {
    mockUpstream({
      '/rest/v1/dashboard_summary': () => [],
      '/rest/v1/rpc/dashboard_employees_at_month_ends': () => [],
      '/rest/v1/signature_requests': () => [],
    });

    const response = await apiRequest('/dashboard/summary');

    expect(response.status).toBe(200);
    const [auth] = callsTo('/auth/v1/user');
    expect(auth!.headers.get('Authorization')).toBe(`Bearer ${testAccessToken}`);
  });

  it('lets a test send its own contract header', async () => {
    const response = await apiRequest('/me', {
      headers: { [clientContractHeader]: 'app:0000000000000000' },
    });

    expect(response.status).toBe(426);
  });

  it('sends no token when a test asks for none', async () => {
    const response = await apiRequest('/me', { token: null });

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends a plain object as JSON', async () => {
    mockUpstream({
      'POST /rest/v1/rpc/current_membership': () => [membershipRow({ role: 'owner' })],
    });

    const response = await apiRequest('/organization/invitations', {
      method: 'POST',
      body: { email: 'not-an-email' },
    });

    expect(response.status).toBe(400);
  });
});
