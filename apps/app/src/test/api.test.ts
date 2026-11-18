import { describe, expect, it } from 'vitest';

import { bodiesOf, bodyOf, installFetchMock, mockApi, requestsTo } from './api';
import { meRecord } from './records';

installFetchMock();

const api = 'http://localhost:8787';

describe('the shared API mock', () => {
  it('answers from the route first, then /me, and refuses anything else', async () => {
    mockApi((_init, url) =>
      url.pathname === '/clients' ? Response.json({ items: [] }) : undefined
    );

    expect(await (await fetch(`${api}/clients`)).json()).toEqual({ items: [] });
    expect(await (await fetch(`${api}/me`)).json()).toEqual(meRecord());
    await expect(fetch(`${api}/workplaces`, { method: 'DELETE' })).rejects.toThrow(
      'Unexpected request: DELETE /workplaces'
    );
  });

  it('lets a route answer /me, a test hand in its own /me, or refuse /me', async () => {
    const specialist = meRecord({
      membership: { organization: { id: 'org', name: 'Org' }, role: 'specialist' },
    });
    mockApi(() => undefined, { me: specialist });
    expect(await (await fetch(`${api}/me`)).json()).toEqual(specialist);

    mockApi((_init, url) => (url.pathname === '/me' ? Response.json({ user: null }) : undefined));
    expect(await (await fetch(`${api}/me`)).json()).toEqual({ user: null });

    mockApi(() => undefined, { me: null });
    await expect(fetch(`${api}/me`)).rejects.toThrow('Unexpected request: GET /me');
  });

  it('finds the requests to a path by method and reads their bodies', async () => {
    mockApi(() => new Response(null, { status: 204 }));

    await fetch(`${api}/clients?page=2`);
    await fetch(`${api}/clients`, { method: 'POST', body: JSON.stringify({ name: 'A' }) });
    await fetch(`${api}/clients`, { method: 'POST', body: JSON.stringify({ name: 'B' }) });

    expect(requestsTo('/clients')).toHaveLength(1);
    expect(bodyOf('/clients', 'POST', 1)).toEqual({ name: 'B' });
    expect(bodiesOf('/clients', 'POST')).toEqual([{ name: 'A' }, { name: 'B' }]);
    expect(bodiesOf('/clients', 'GET')).toEqual([null]);
  });
});
