import {
  acknowledgeReleasesResponseSchema,
  releaseListResponseSchema,
  releaseSchema,
} from '@ssm-usor/contracts';
import { describe, expect, it } from 'vitest';

import { apiRequest } from '../../test/request';
import {
  callsTo,
  databaseError,
  mockUpstream as mockSignedInUpstream,
  stubFetch,
} from '../../test/upstream';

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

function mockUpstream({
  rows = [newest, first],
  acknowledge = (): Response => Response.json('2026.10.24.2'),
} = {}) {
  mockSignedInUpstream({
    '/rest/v1/release_list': ({ url }) => {
      const tag = url.searchParams.get('tag');
      if (!tag) return rows;
      return Response.json(rows.find((row) => `eq.${row.tag}` === tag) ?? null);
    },
    '/rest/v1/rpc/acknowledge_releases': acknowledge,
  });
}

const upstreamUrls = (pathname: string) => callsTo(pathname).map(({ url }) => url);

const rpcBodies = () => callsTo('/rest/v1/rpc/acknowledge_releases').map(({ body }) => body);

const postgrestError = (code: string, status: number) => databaseError(code, code, status);

stubFetch();

describe('GET /releases', () => {
  it('lists every release in full, newest first, with whether the caller has read it', async () => {
    mockUpstream();

    const response = await apiRequest('/releases');

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

    const response = await apiRequest('/releases');

    expect(await response.json()).toEqual({ items: [] });
  });
});

describe('GET /releases/{tag}', () => {
  it('returns the release with that tag', async () => {
    mockUpstream();

    const response = await apiRequest('/releases/2026.10.10');

    expect(response.status).toBe(200);
    expect(releaseSchema.parse(await response.json())).toMatchObject({
      tag: '2026.10.10',
      lead: null,
      unread: false,
    });
  });

  it('is 404 for a tag no release has', async () => {
    mockUpstream();

    const response = await apiRequest('/releases/2026.01.01');

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: 'not_found' });
  });

  it('refuses what is not a release tag without asking the database', async () => {
    mockUpstream();

    const response = await apiRequest('/releases/latest');

    expect(response.status).toBe(400);
    expect(upstreamUrls('/rest/v1/release_list')).toEqual([]);
  });
});

describe('POST /releases/acknowledge', () => {
  it('acknowledges through the given release and returns what the profile keeps', async () => {
    mockUpstream({ acknowledge: () => Response.json('2026.10.24.2') });

    const response = await apiRequest('/releases/acknowledge', {
      method: 'POST',
      body: { tag: '2026.10.10' },
    });

    expect(response.status).toBe(200);
    expect(acknowledgeReleasesResponseSchema.parse(await response.json())).toEqual({
      acknowledgedThrough: '2026.10.24.2',
    });
    expect(rpcBodies()).toEqual([{ through: '2026.10.10' }]);
  });

  it('is 404 for a tag no release has', async () => {
    mockUpstream({ acknowledge: () => postgrestError('REL01', 400) });

    const response = await apiRequest('/releases/acknowledge', {
      method: 'POST',
      body: { tag: '2026.01.01' },
    });

    expect(response.status).toBe(404);
  });

  it('is 409 for an account without a profile', async () => {
    mockUpstream({ acknowledge: () => postgrestError('REL02', 400) });

    const response = await apiRequest('/releases/acknowledge', {
      method: 'POST',
      body: { tag: '2026.10.24.2' },
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: 'conflict', reason: 'profile_missing' });
  });

  it('refuses a body without a release tag', async () => {
    mockUpstream();

    const response = await apiRequest('/releases/acknowledge', {
      method: 'POST',
      body: { tag: 'v1' },
    });

    expect(response.status).toBe(400);
    expect(rpcBodies()).toEqual([]);
  });
});
