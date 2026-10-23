import {
  acknowledgeReleasesResponseSchema,
  releaseListResponseSchema,
  releaseSchema,
} from '@ssm-usor/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../app';
import type { ApiEnv } from '../../lib/env';

const env: ApiEnv['Bindings'] = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key',
};

const user = { id: '0f7c8d96-479c-47b3-b49e-01f4555a0221', email: 'ana@example.ro' };

const newest = {
  tag: '2026.10.24.2',
  published_at: '2026-10-24T09:00:00+00:00',
  headline: 'Teste de verificare, direct din portal',
  lead: 'Dai un test angajaților unui client, ei răspund de pe telefon.',
  features: [
    {
      title: 'Angajații răspund de pe telefon',
      text: 'Fiecare angajat primește un cod pe e-mail sau SMS.',
      where: 'Client, fila Instruiri, testul trimis',
      icon: 'smartphone',
    },
  ],
  improvements: ['Lista de angajați are un filtru „La zi”.'],
  fixes: [],
  unread: true,
};
const first = {
  tag: '2026.10.10',
  published_at: '2026-10-10T08:00:00+00:00',
  headline: 'Prima versiune publică',
  lead: null,
  features: [],
  improvements: [],
  fixes: ['Numele cu cratimă apar întregi pe fișa semnată.'],
  unread: false,
};

const fetchMock = vi.fn<typeof fetch>();

function mockUpstream({
  rows = [newest, first],
  acknowledge = (): Response => Response.json('2026.10.24.2'),
} = {}) {
  fetchMock.mockImplementation(async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.pathname === '/auth/v1/user') return Response.json({ ...user, is_anonymous: false });
    if (url.pathname === '/rest/v1/release_list') {
      const tag = url.searchParams.get('tag');
      if (!tag) return Response.json(rows);
      return Response.json(rows.find((row) => `eq.${row.tag}` === tag) ?? null);
    }
    if (url.pathname === '/rest/v1/rpc/acknowledge_releases') return acknowledge();
    throw new Error(`Unexpected upstream request: ${url}`);
  });
}

const request = (path: string, init: RequestInit = {}) =>
  createApp().request(
    path,
    { ...init, headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' } },
    env
  );

const upstreamUrls = (pathname: string) =>
  fetchMock.mock.calls
    .map(([input]) => new URL(input instanceof Request ? input.url : String(input)))
    .filter((url) => url.pathname === pathname);

const rpcBodies = () =>
  fetchMock.mock.calls
    .filter(([input]) => String(input).includes('/rest/v1/rpc/acknowledge_releases'))
    .map(([, init]) => JSON.parse(init?.body as string));

const postgrestError = (code: string, status: number) =>
  Response.json({ code, message: code, details: null, hint: null }, { status });

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GET /releases', () => {
  it('lists every release in full, newest first, with whether the caller has read it', async () => {
    mockUpstream();

    const response = await request('/releases');

    expect(response.status).toBe(200);
    const body = releaseListResponseSchema.parse(await response.json());
    expect(body.items.map((item) => [item.tag, item.unread])).toEqual([
      ['2026.10.24.2', true],
      ['2026.10.10', false],
    ]);
    expect(body.items[0]).toEqual({
      tag: '2026.10.24.2',
      publishedAt: '2026-10-24T09:00:00.000Z',
      headline: newest.headline,
      lead: newest.lead,
      features: newest.features,
      improvements: newest.improvements,
      fixes: [],
      unread: true,
    });
    expect(upstreamUrls('/rest/v1/release_list')[0]!.searchParams.get('order')).toBe(
      'published_at.desc'
    );
  });

  it('answers an empty list before the first update', async () => {
    mockUpstream({ rows: [] });

    const response = await request('/releases');

    expect(await response.json()).toEqual({ items: [] });
  });
});

describe('GET /releases/{tag}', () => {
  it('returns the release with that tag', async () => {
    mockUpstream();

    const response = await request('/releases/2026.10.10');

    expect(response.status).toBe(200);
    expect(releaseSchema.parse(await response.json())).toMatchObject({
      tag: '2026.10.10',
      lead: null,
      unread: false,
    });
  });

  it('is 404 for a tag no release has', async () => {
    mockUpstream();

    const response = await request('/releases/2026.01.01');

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: 'not_found' });
  });

  it('refuses what is not a release tag without asking the database', async () => {
    mockUpstream();

    const response = await request('/releases/latest');

    expect(response.status).toBe(400);
    expect(upstreamUrls('/rest/v1/release_list')).toEqual([]);
  });
});

describe('POST /releases/acknowledge', () => {
  it('acknowledges through the given release and returns what the profile keeps', async () => {
    mockUpstream({ acknowledge: () => Response.json('2026.10.24.2') });

    const response = await request('/releases/acknowledge', {
      method: 'POST',
      body: JSON.stringify({ tag: '2026.10.10' }),
    });

    expect(response.status).toBe(200);
    expect(acknowledgeReleasesResponseSchema.parse(await response.json())).toEqual({
      acknowledgedThrough: '2026.10.24.2',
    });
    expect(rpcBodies()).toEqual([{ through: '2026.10.10' }]);
  });

  it('is 404 for a tag no release has', async () => {
    mockUpstream({ acknowledge: () => postgrestError('REL01', 400) });

    const response = await request('/releases/acknowledge', {
      method: 'POST',
      body: JSON.stringify({ tag: '2026.01.01' }),
    });

    expect(response.status).toBe(404);
  });

  it('is 409 for an account without a profile', async () => {
    mockUpstream({ acknowledge: () => postgrestError('REL02', 400) });

    const response = await request('/releases/acknowledge', {
      method: 'POST',
      body: JSON.stringify({ tag: '2026.10.24.2' }),
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: 'conflict', reason: 'profile_missing' });
  });

  it('refuses a body without a release tag', async () => {
    mockUpstream();

    const response = await request('/releases/acknowledge', {
      method: 'POST',
      body: JSON.stringify({ tag: 'v1' }),
    });

    expect(response.status).toBe(400);
    expect(rpcBodies()).toEqual([]);
  });
});
