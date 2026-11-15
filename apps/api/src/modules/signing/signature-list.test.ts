import { signatureListResponseSchema } from '@ssm-usor/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../app';
import {
  callsTo,
  clientId,
  databaseError,
  env,
  fetchMock,
  mockUpstream,
  organizationId,
  type UpstreamCall,
  user,
} from './upstream.fixture';

const trainingId = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const sheetId = '6b5a4c3d-2e1f-4a0b-9c8d-7e6f5a4b3c2d';
const popescuId = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const taranuId = '5d0f1a9e-2a6b-4c3d-8e7f-1a2b3c4d5e6f';
const otherClientId = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e';

const request = (path: string) =>
  createApp().request(
    path,
    { method: 'GET', headers: { Authorization: 'Bearer user-token' } },
    env
  );

const trainingRow = {
  id: trainingId,
  kind: 'training',
  client_id: clientId,
  client_name: 'Fabrica Sigma SRL',
  domain: 'ssm',
  phase: 'introductory_general',
  test: null,
  day: '2026-10-01',
  slots: ['trainer', 'verifier'],
  issued_at: '2026-10-02T08:00:00+00:00',
  signature_count: 4,
  workers: [
    {
      employeeId: taranuId,
      lastName: 'Țăranu',
      firstName: 'Ștefan',
      agreement: {
        state: 'generated',
        employeeSignedAt: '2026-10-03T09:00:00+00:00',
        employerSignedAt: null,
      },
      requests: [
        { id: 'f0000000-0000-4000-8000-000000000003', slot: 'trainer' },
        { id: 'f0000000-0000-4000-8000-000000000004', slot: 'verifier' },
      ],
    },
    {
      employeeId: popescuId,
      lastName: 'Popescu',
      firstName: 'Ion',
      agreement: null,
      requests: [
        { id: 'f0000000-0000-4000-8000-000000000001', slot: 'trainer' },
        { id: 'f0000000-0000-4000-8000-000000000002', slot: 'verifier' },
      ],
    },
  ],
};

const sheetRow = {
  id: sheetId,
  kind: 'test_sheet',
  client_id: otherClientId,
  client_name: 'Atelier Nord SRL',
  domain: 'su',
  phase: null,
  test: 'annual',
  day: '2026-10-15',
  slots: ['examiner'],
  issued_at: '2026-10-15T10:00:00+00:00',
  signature_count: 1,
  workers: [
    {
      employeeId: popescuId,
      lastName: 'Popescu',
      firstName: 'Ion',
      agreement: {
        state: 'signed_electronically',
        employeeSignedAt: '2026-10-03T09:00:00+00:00',
        employerSignedAt: '2026-10-04T09:00:00+00:00',
      },
      requests: [{ id: 'f0000000-0000-4000-8000-000000000005', slot: 'examiner' }],
    },
  ],
};

const isCount = (call: UpstreamCall) => call.url.searchParams.get('select') === 'signature_count';

function listUpstream(
  rows: unknown[],
  counts: { filtered: number[]; unfiltered?: number[] } = {
    filtered: rows.map((row) => (row as { signature_count: number }).signature_count),
  }
) {
  mockUpstream({
    '/rest/v1/signature_list': (call) => {
      if (!isCount(call)) return rows;
      const filtered = ['client_id', 'domain', 'subject', 'search_names'].some((key) =>
        call.url.searchParams.has(key)
      );
      const list = filtered || !counts.unfiltered ? counts.filtered : counts.unfiltered;
      const offset = Number(call.url.searchParams.get('offset') ?? 0);
      const limit = Number(call.url.searchParams.get('limit'));
      return list.slice(offset, offset + limit).map((count) => ({ signature_count: count }));
    },
  });
}

const pageCall = () => callsTo('/rest/v1/signature_list').find((call) => !isCount(call))!;
const countCalls = () => callsTo('/rest/v1/signature_list').filter(isCount);

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('GET /me/signatures', () => {
  it('lists one row per training or test sheet, with the slots and every worker’s requests', async () => {
    listUpstream([trainingRow, sheetRow]);

    const response = await request('/me/signatures');

    expect(response.status).toBe(200);
    const body = signatureListResponseSchema.parse(await response.json());
    expect(body).toEqual({
      items: [
        {
          id: trainingId,
          kind: 'training',
          client: { id: clientId, name: 'Fabrica Sigma SRL' },
          domain: 'ssm',
          phase: 'introductory_general',
          test: null,
          day: '2026-10-01',
          slots: ['trainer', 'verifier'],
          issuedAt: '2026-10-02T08:00:00.000Z',
          signatures: 4,
          workers: [
            {
              employee: { id: popescuId, lastName: 'Popescu', firstName: 'Ion' },
              agreement: null,
              requests: [
                { id: 'f0000000-0000-4000-8000-000000000001', slot: 'trainer' },
                { id: 'f0000000-0000-4000-8000-000000000002', slot: 'verifier' },
              ],
            },
            {
              employee: { id: taranuId, lastName: 'Țăranu', firstName: 'Ștefan' },
              agreement: {
                state: 'generated',
                employeeSignedAt: '2026-10-03T09:00:00.000Z',
                employerSignedAt: null,
              },
              requests: [
                { id: 'f0000000-0000-4000-8000-000000000003', slot: 'trainer' },
                { id: 'f0000000-0000-4000-8000-000000000004', slot: 'verifier' },
              ],
            },
          ],
        },
        {
          id: sheetId,
          kind: 'test_sheet',
          client: { id: otherClientId, name: 'Atelier Nord SRL' },
          domain: 'su',
          phase: null,
          test: 'annual',
          day: '2026-10-15',
          slots: ['examiner'],
          issuedAt: '2026-10-15T10:00:00.000Z',
          signatures: 1,
          workers: [
            {
              employee: { id: popescuId, lastName: 'Popescu', firstName: 'Ion' },
              agreement: {
                state: 'signed_electronically',
                employeeSignedAt: '2026-10-03T09:00:00.000Z',
                employerSignedAt: '2026-10-04T09:00:00.000Z',
              },
              requests: [{ id: 'f0000000-0000-4000-8000-000000000005', slot: 'examiner' }],
            },
          ],
        },
      ],
      page: 1,
      pageSize: 25,
      total: 2,
      unfilteredTotal: 2,
      signatures: 5,
      unfilteredSignatures: 5,
    });
  });

  it("reads only the caller's own rows in the membership's organization, oldest request first", async () => {
    listUpstream([trainingRow]);

    await request('/me/signatures');

    for (const call of callsTo('/rest/v1/signature_list')) {
      expect(call.url.searchParams.get('signer_account_id')).toBe(`eq.${user.id}`);
      expect(call.url.searchParams.get('organization_id')).toBe(`eq.${organizationId}`);
      expect(call.secret).toBe(false);
    }
    const page = pageCall().url.searchParams;
    expect(page.get('order')).toBe('issued_at.asc,id.asc');
    expect(page.get('offset')).toBe('0');
    expect(page.get('limit')).toBe('25');
    expect(page.get('select')).toBe(
      'id,kind,client_id,client_name,domain,phase,test,day,slots,issued_at,signature_count,workers'
    );
    expect(countCalls()).toHaveLength(1);
  });

  it('sorts by the day or the client, the oldest request breaking ties', async () => {
    listUpstream([trainingRow]);

    await request('/me/signatures?sort=day&order=desc&page=2&pageSize=10');
    expect(pageCall().url.searchParams.get('order')).toBe('day.desc,issued_at.asc,id.asc');
    expect(pageCall().url.searchParams.get('offset')).toBe('10');

    fetchMock.mockClear();
    await request('/me/signatures?sort=client');
    expect(pageCall().url.searchParams.get('order')).toBe('client_name.asc,issued_at.asc,id.asc');
  });

  it('filters by client, domain and what is signed, and searches one worker’s name', async () => {
    listUpstream([trainingRow], { filtered: [4], unfiltered: [4, 1, 2] });

    const response = await request(
      `/me/signatures?client=${clientId}&client=${otherClientId}&domain=ssm&kind=introductory_general&kind=test&q=%C8%9Aaranu%20Stef`
    );

    expect(response.status).toBe(200);
    const body = signatureListResponseSchema.parse(await response.json());
    expect(body).toMatchObject({
      total: 1,
      signatures: 4,
      unfilteredTotal: 3,
      unfilteredSignatures: 7,
    });
    const page = pageCall().url.searchParams;
    expect(page.get('client_id')).toBe(`in.(${clientId},${otherClientId})`);
    expect(page.get('domain')).toBe('in.(ssm)');
    expect(page.get('subject')).toBe('in.(introductory_general,test)');
    expect(page.get('search_names')).toBe('match.(^|\\|)(?=[^|]*taranu)(?=[^|]*stef)');
    const [filtered, unfiltered] = [
      countCalls().find((call) => call.url.searchParams.has('client_id'))!,
      countCalls().find((call) => !call.url.searchParams.has('client_id'))!,
    ];
    expect(filtered.url.searchParams.get('search_names')).toBe(page.get('search_names'));
    for (const key of ['domain', 'subject', 'search_names']) {
      expect(unfiltered.url.searchParams.has(key)).toBe(false);
    }
  });

  it('counts past the thousand rows PostgREST answers at once', async () => {
    listUpstream([trainingRow], { filtered: [...Array.from({ length: 1000 }, () => 2), 1, 1] });

    const body = signatureListResponseSchema.parse(await (await request('/me/signatures')).json());

    expect(body).toMatchObject({ total: 1002, signatures: 2002 });
    expect(countCalls().map((call) => call.url.searchParams.get('offset'))).toEqual(['0', '1000']);
    expect(countCalls()[0]!.url.searchParams.get('order')).toBe('id.asc');
  });

  it('answers an empty page past the end with the real counts', async () => {
    listUpstream([], { filtered: [4, 1] });

    const body = signatureListResponseSchema.parse(
      await (await request('/me/signatures?page=9')).json()
    );

    expect(body).toMatchObject({ items: [], page: 9, total: 2, signatures: 5 });
  });

  it.each([
    ['a client that is not an id', 'client=atelier'],
    ['a slot as what is signed', 'kind=admitter'],
    ['an unknown sort', 'sort=signer'],
  ])('refuses %s', async (_, query) => {
    listUpstream([]);
    const response = await request(`/me/signatures?${query}`);
    expect(response.status).toBe(400);
    expect(callsTo('/rest/v1/signature_list')).toHaveLength(0);
  });

  it('fails when the database does', async () => {
    mockUpstream({
      '/rest/v1/signature_list': () => databaseError('XX000', 'boom', 500),
    });
    const response = await request('/me/signatures');
    expect(response.status).toBe(500);
  });
});
