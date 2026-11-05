import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { adminClient } from '../../lib/admin-db';
import type { ApiEnv } from '../../lib/env';
import { importRecords } from './records';

const env: ApiEnv['Bindings'] = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key',
  SUPABASE_SECRET_KEY: 'sb_secret_test_key_records',
  CORS_ORIGINS: 'http://localhost:5173',
};

const now = new Date('2026-11-05T02:41:00Z');
const idOf = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;

type Request = { method: string; url: URL; body: unknown };

const fetchMock = vi.fn<typeof fetch>();
let requests: Request[];
let ended: {
  id: string;
  status: string;
  confirmed_at: string | null;
  import_library_parts: unknown[];
}[];
let copies: { import_id: string; part: string | null; completed_at: string | null }[];
let dayIds: string[];
let claimed: boolean;

const page = <T>(rows: T[], url: URL) => {
  const offset = Number(url.searchParams.get('offset') ?? 0);
  const limit = Number(url.searchParams.get('limit') ?? rows.length);
  return Response.json(rows.slice(offset, offset + Math.min(limit, 1000)));
};

beforeEach(() => {
  requests = [];
  ended = [];
  copies = [];
  dayIds = [];
  claimed = false;
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = init?.method ?? 'GET';
    const raw = init?.body;
    requests.push({ method, url, body: typeof raw === 'string' ? JSON.parse(raw) : raw });
    const select = url.searchParams.get('select') ?? '';
    if (url.pathname === '/rest/v1/imports' && method === 'PATCH') {
      const first = !claimed;
      claimed = true;
      return Response.json(first ? [{ id: idOf(1) }] : []);
    }
    if (url.pathname === '/rest/v1/imports' && url.searchParams.has('status')) {
      return page(ended, url);
    }
    if (url.pathname === '/rest/v1/imports' && url.searchParams.has('or')) {
      return page(
        dayIds.map((id) => ({ id })),
        url
      );
    }
    if (url.pathname === '/rest/v1/imports' && select.startsWith('id,status')) {
      const ids = url.searchParams.get('id')!.slice('in.('.length, -1).split(',');
      return Response.json(ended.filter((row) => ids.includes(row.id)));
    }
    if (url.pathname === '/rest/v1/imports') {
      const ids = url.searchParams.get('id')!.slice('in.('.length, -1).split(',');
      return Response.json(
        ids.map((id) => ({ id, status: 'confirmed', import_library_parts: [] }))
      );
    }
    if (url.pathname === '/rest/v1/import_library_parts') return page([], url);
    if (url.pathname === '/rest/v1/import_copies') {
      const ids = url.searchParams.get('import_id')!.slice('in.('.length, -1).split(',');
      return Response.json(copies.filter((copy) => ids.includes(copy.import_id)));
    }
    throw new Error(`Unexpected request: ${method} ${url}`);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const records = () => importRecords(adminClient(env));

describe('uncopied', () => {
  it('reads every ended import page by page in a stable order, past the 1000 rows PostgREST answers', async () => {
    ended = Array.from({ length: 1500 }, (_, index) => ({
      id: idOf(index),
      status: 'abandoned',
      confirmed_at: null,
      import_library_parts: [],
    }));
    copies = ended
      .slice(0, 1499)
      .map((row) => ({ import_id: row.id, part: null, completed_at: '2026-11-01T00:00:00Z' }));

    expect(await records().uncopied(now)).toEqual([
      { importId: idOf(1499), part: null, recorded: false },
    ]);
    const listed = requests.filter((request) => request.url.searchParams.has('status'));
    expect(listed.map((request) => request.url.searchParams.get('offset'))).toEqual(['0', '1000']);
    for (const request of listed) {
      expect(request.url.searchParams.get('order')).toBe('id.asc');
      expect(request.url.searchParams.get('limit')).toBe('1000');
    }
  });

  it('lists a copy recorded but never completed, and not one completed', async () => {
    ended = [
      {
        id: idOf(1),
        status: 'confirmed',
        confirmed_at: '2026-11-04T10:00:00Z',
        import_library_parts: [{ part: 'risk_evaluations', status: 'confirmed' }],
      },
    ];
    copies = [
      { import_id: idOf(1), part: null, completed_at: null },
      { import_id: idOf(1), part: 'risk_evaluations', completed_at: '2026-11-04T10:05:00Z' },
    ];

    expect(await records().uncopied(now)).toEqual([
      { importId: idOf(1), part: null, recorded: true },
    ]);
  });
});

describe('incompleteCopies', () => {
  it("lists the named imports' copies not complete, their parts' included", async () => {
    ended = [
      {
        id: idOf(1),
        status: 'abandoned',
        confirmed_at: null,
        import_library_parts: [{ part: 'instructions_ssm', status: 'to_review' }],
      },
      { id: idOf(2), status: 'confirmed', confirmed_at: null, import_library_parts: [] },
    ];
    copies = [
      { import_id: idOf(1), part: null, completed_at: '2026-11-04T10:00:00Z' },
      { import_id: idOf(2), part: null, completed_at: '2026-11-04T10:00:00Z' },
    ];

    expect(await records().incompleteCopies([idOf(1), idOf(2)], now)).toEqual([
      { importId: idOf(1), part: 'instructions_ssm', recorded: false },
    ]);
  });
});

describe('between', () => {
  it("pages the day's events in a stable order, and reads only what the summary counts", async () => {
    dayIds = Array.from({ length: 1001 }, (_, index) => idOf(index));
    const day = await records().between('2026-11-04T00:00:00.000Z', '2026-11-05T00:00:00.000Z');

    expect(day).toHaveLength(1001);
    const listed = requests.filter((request) => request.url.searchParams.has('or'));
    expect(
      listed
        .filter((request) => request.url.pathname === '/rest/v1/imports')
        .map((request) => [
          request.url.searchParams.get('order'),
          request.url.searchParams.get('offset'),
        ])
    ).toEqual([
      ['id.asc', '0'],
      ['id.asc', '1000'],
    ]);
    expect(
      listed
        .find((request) => request.url.pathname === '/rest/v1/import_library_parts')!
        .url.searchParams.get('order')
    ).toBe('import_id.asc,part.asc');
    const read = requests.find(
      (request) => request.url.pathname === '/rest/v1/imports' && request.url.searchParams.has('id')
    )!;
    const columns = read.url.searchParams.get('select')!;
    expect(columns).toContain('expensive_alerted_at');
    expect(columns).not.toMatch(/proposal|changes|usage_by_step/);
  });
});

describe('claimExpensiveAlert', () => {
  it('marks the alert sent only where it is not yet, so one caller wins', async () => {
    const [first, second] = await Promise.all([
      records().claimExpensiveAlert(idOf(1)),
      records().claimExpensiveAlert(idOf(1)),
    ]);

    expect([first, second].sort()).toEqual([false, true]);
    const patch = requests.find((request) => request.method === 'PATCH')!;
    expect(patch.url.searchParams.get('expensive_alerted_at')).toBe('is.null');
    expect(patch.body).toEqual({ expensive_alerted_at: expect.any(String) });
  });
});
