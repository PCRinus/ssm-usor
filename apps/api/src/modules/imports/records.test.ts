import { beforeEach, describe, expect, it } from 'vitest';

import { adminClient } from '../../lib/admin-db';
import {
  routeUpstream,
  stubFetch,
  testEnv,
  testSecretKey,
  type UpstreamCall,
  upstreamCalls,
} from '../../test/upstream';
import { importRecords } from './records';

const env = testEnv({ SUPABASE_SECRET_KEY: testSecretKey, CORS_ORIGINS: 'http://localhost:5173' });

const now = new Date('2026-11-05T02:41:00Z');
const idOf = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;

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

function imports({ method, url }: UpstreamCall) {
  if (method === 'PATCH') {
    const first = !claimed;
    claimed = true;
    return Response.json(first ? [{ id: idOf(1) }] : []);
  }
  if (url.searchParams.has('status')) return page(ended, url);
  if (url.searchParams.has('or')) {
    return page(
      dayIds.map((id) => ({ id })),
      url
    );
  }
  const ids = url.searchParams.get('id')!.slice('in.('.length, -1).split(',');
  if (url.searchParams.get('select')?.startsWith('id,status')) {
    return Response.json(ended.filter((row) => ids.includes(row.id)));
  }
  return Response.json(ids.map((id) => ({ id, status: 'confirmed', import_library_parts: [] })));
}

stubFetch();

beforeEach(() => {
  ended = [];
  copies = [];
  dayIds = [];
  claimed = false;
  routeUpstream({
    '/rest/v1/imports': imports,
    '/rest/v1/import_library_parts': ({ url }) => page([], url),
    '/rest/v1/import_copies': ({ url }) => {
      const ids = url.searchParams.get('import_id')!.slice('in.('.length, -1).split(',');
      return Response.json(copies.filter((copy) => ids.includes(copy.import_id)));
    },
  });
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
    const listed = upstreamCalls().filter((request) => request.url.searchParams.has('status'));
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
    const listed = upstreamCalls().filter((request) => request.url.searchParams.has('or'));
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
    const read = upstreamCalls().find(
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
    const patch = upstreamCalls().find((request) => request.method === 'PATCH')!;
    expect(patch.url.searchParams.get('expensive_alerted_at')).toBe('is.null');
    expect(patch.body).toEqual({ expensive_alerted_at: expect.any(String) });
  });
});
