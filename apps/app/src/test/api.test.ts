import { setupGuideSchema, setupStepIds } from '@ssm-usor/contracts';
import { describe, expect, it } from 'vitest';

import type { Release } from '@/api/generated/api';

import { bodiesOf, bodyOf, finishedSetupGuide, installFetchMock, mockApi, requestsTo } from './api';
import { quietSummary } from './dashboard-fixture';
import { clientId, meRecord } from './records';

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

  it("answers the shell's background reads unless a route does", async () => {
    const release: Release = {
      tag: '2026.11.18',
      publishedAt: '2026-11-18T08:00:00.000Z',
      headline: 'Lista de clienți se filtrează mai ușor',
      lead: null,
      features: [],
      improvements: [],
      fixes: [],
      unread: true,
    };
    mockApi((_init, url) =>
      url.pathname === '/releases' ? Response.json({ items: [release] }) : undefined
    );

    expect(await (await fetch(`${api}/releases`)).json()).toEqual({ items: [release] });
    expect(await (await fetch(`${api}/me/setup`)).json()).toEqual(finishedSetupGuide);
    expect(await (await fetch(`${api}/imports?kind=all`)).json()).toEqual({ items: [] });
    expect(await (await fetch(`${api}/documents/behind/summary`)).json()).toEqual({
      counts: { occupational_safety: 0, fire_safety: 0 },
      running: [],
    });
    expect(await (await fetch(`${api}/dashboard/summary`)).json()).toEqual(quietSummary);
    await expect(fetch(`${api}/imports`)).rejects.toThrow('Unexpected request: GET /imports');
    await expect(fetch(`${api}/imports?kind=employees&clientId=${clientId}`)).rejects.toThrow(
      'Unexpected request: GET /imports'
    );
    await expect(fetch(`${api}/documents/behind/summary?set=fire_safety`)).rejects.toThrow(
      'Unexpected request: GET /documents/behind/summary'
    );
    await expect(fetch(`${api}/imports?kind=all`, { method: 'POST' })).rejects.toThrow(
      'Unexpected request: POST /imports'
    );
  });

  it('answers a setup guide the app can read, with every step once', () => {
    expect(setupGuideSchema.parse(finishedSetupGuide)).toEqual(finishedSetupGuide);
    expect(finishedSetupGuide.steps.map((step) => step.id)).toEqual(setupStepIds);
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
