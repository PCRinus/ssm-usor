import { describe, expect, it } from 'vitest';

import {
  adminRequests,
  installAdminFetch,
  mockAdminApi,
  takeUnexpectedRequests,
} from './admin-app';

installAdminFetch();

const api = 'http://localhost:5176';

describe('the admin API mock', () => {
  it('answers from the route first, then the shell, and refuses anything else', async () => {
    mockAdminApi((url) =>
      url.pathname === '/api/members' ? Response.json({ items: [] }) : undefined
    );

    expect(await (await fetch(`${api}/api/members`)).json()).toEqual({ items: [] });
    expect(await (await fetch(`${api}/api/impersonation`)).json()).toEqual({
      impersonation: null,
    });
    expect(await (await fetch(`${api}/api/me`)).json()).toEqual({
      id: 'user-1',
      email: 'mircea@example.ro',
    });
    await expect(fetch(`${api}/api/impersonation`, { method: 'DELETE' })).rejects.toThrow(
      'Unexpected request: DELETE /api/impersonation'
    );
    await expect(fetch(`${api}/api/imports`)).rejects.toThrow(
      'Unexpected request: GET /api/imports'
    );
    await expect(fetch(`${api}/api/me`, { method: 'POST' })).rejects.toThrow(
      'Unexpected request: POST /api/me'
    );
    expect(takeUnexpectedRequests()).toEqual([
      'DELETE /api/impersonation',
      'GET /api/imports',
      'POST /api/me',
    ]);
  });

  it('lets a route answer for the shell', async () => {
    mockAdminApi((url) =>
      url.pathname === '/api/me' ? Response.json({ id: 'admin', email: 'a@example.ro' }) : undefined
    );

    expect(await (await fetch(`${api}/api/me`)).json()).toEqual({
      id: 'admin',
      email: 'a@example.ro',
    });
  });

  it('logs the requests without the impersonation poll unless asked for its path', async () => {
    mockAdminApi(() => new Response(null, { status: 204 }));

    await fetch(`${api}/api/impersonation`);
    await fetch(`${api}/api/members?page=2`);
    await fetch(`${api}/api/impersonation`, {
      method: 'POST',
      body: JSON.stringify({ reason: 'Support' }),
    });

    expect(
      adminRequests().map(({ url, method }) => `${method} ${url.pathname}${url.search}`)
    ).toEqual(['GET /api/members?page=2']);
    expect(adminRequests({ pathname: '/api/impersonation' })).toHaveLength(2);
    expect(adminRequests({ pathname: '/api/impersonation', method: 'POST' })[0]!.body).toEqual({
      reason: 'Support',
    });
  });
});
