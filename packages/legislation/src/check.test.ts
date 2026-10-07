import { readFileSync } from 'node:fs';

import { createClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import { checkLegislation, isNewer, legalActsSchema, summarize } from './check';
import type { LegislationDatabase } from './database';
import type { PortalAct } from './portal';

const { acts } = legalActsSchema.parse(
  JSON.parse(readFileSync(new URL('../fixtures/legal-acts.json', import.meta.url), 'utf8'))
);
const [law, norms, order] = acts as [(typeof acts)[0], (typeof acts)[0], (typeof acts)[0]];

const portalAct = (portalId: number, newest: string | null, amendingActs: string[] = []) =>
  ({
    portalId,
    title: 'LEGE',
    status: 'in_force',
    consolidations: newest ? [newest] : [],
    newestConsolidation: newest,
    amendingActs,
  }) satisfies PortalAct;

type Row = {
  id: string;
  last_consolidated_on: string | null;
  verified_consolidated_on: string | null;
};

function database(rows: Row[], options: { changeExists?: boolean } = {}) {
  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    if (url.pathname === '/rest/v1/legal_acts' && method === 'POST') return Response.json(rows);
    if (url.pathname === '/rest/v1/legal_acts' && method === 'PATCH') {
      return new Response(null, { status: 204 });
    }
    if (url.pathname === '/rest/v1/legal_changes' && method === 'POST') {
      return Response.json(options.changeExists ? [] : [{ id: 'c1' }], { status: 201 });
    }
    throw new Error(`Unexpected request: ${method} ${url}`);
  });
  const db = createClient<LegislationDatabase>('https://example.supabase.co', 'sb_secret_test', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: fetchMock },
  });
  const sent = (table: string, method: string) =>
    fetchMock.mock.calls
      .filter(([input, init]) => {
        const url = new URL(String(input));
        return url.pathname === `/rest/v1/${table}` && init?.method === method;
      })
      .map(([input, init]) => ({
        url: new URL(String(input)),
        body: JSON.parse(String(init?.body)),
      }));
  return { db, sent };
}

const row = (id: string, last: string | null = null, verified: string | null = null): Row => ({
  id,
  last_consolidated_on: last,
  verified_consolidated_on: verified,
});

describe('deciding whether a form is a change', () => {
  it('takes the first form seen as the baseline', () => {
    expect(isNewer('2021-07-25', row('a'))).toBe(false);
  });

  it('reports a form newer than the last one seen', () => {
    expect(isNewer('2021-07-25', row('a', '2021-05-06'))).toBe(true);
    expect(isNewer('2021-07-25', row('a', '2021-07-25'))).toBe(false);
  });

  it('reports a form newer than the verified one, also on the first run', () => {
    expect(isNewer('2021-07-25', row('a', null, '2021-05-06'))).toBe(true);
    expect(isNewer('2021-07-25', row('a', '2021-07-25', '2021-05-06'))).toBe(true);
    expect(isNewer('2021-07-25', row('a', null, '2021-07-25'))).toBe(false);
  });

  it('has nothing to compare for an act never consolidated', () => {
    expect(isNewer(null, row('a', '2021-05-06'))).toBe(false);
  });
});

describe('checking the watched acts', () => {
  it('saves every act, skips the one without a portal id and records a newer form', async () => {
    const { db, sent } = database([
      row(law.id, '2021-05-06'),
      row(norms.id, '2022-03-07'),
      row(order.id),
    ]);
    const readAct = vi.fn(async (portalId: number) =>
      portalId === 73772
        ? portalAct(portalId, '2021-07-25', ['LEGE 208 21/07/2021'])
        : portalAct(portalId, '2022-03-07')
    );
    const outcomes = await checkLegislation(db, acts, { readAct, pauseMs: 0 });

    expect(sent('legal_acts', 'POST')[0]!.body).toEqual([
      { id: 'lege-319-2006', name: 'Legea 319/2006', portal_id: 73772 },
      { id: 'hg-1425-2006', name: 'H.G. 1425/2006', portal_id: 76337 },
      { id: 'omai-163-2007', name: 'OMAI 163/2007', portal_id: null },
    ]);
    expect(readAct.mock.calls.map(([portalId]) => portalId)).toEqual([73772, 76337]);

    const changes = sent('legal_changes', 'POST');
    expect(changes).toHaveLength(1);
    expect(changes[0]!.body).toEqual({
      act_id: 'lege-319-2006',
      consolidated_on: '2021-07-25',
      amending_act: 'LEGE 208 21/07/2021',
    });
    expect(changes[0]!.url.searchParams.get('on_conflict')).toBe('act_id,consolidated_on');

    const updates = sent('legal_acts', 'PATCH');
    expect(updates.map((update) => update.url.searchParams.get('id'))).toEqual([
      'eq.lege-319-2006',
      'eq.hg-1425-2006',
    ]);
    expect(updates[0]!.body).toMatchObject({
      portal_status: 'in_force',
      last_consolidated_on: '2021-07-25',
      last_amending_act: 'LEGE 208 21/07/2021',
    });

    expect(outcomes.map((outcome) => outcome.result)).toEqual(['checked', 'checked', 'skipped']);
    expect(summarize(outcomes)).toBe(
      [
        'lege-319-2006      Legea 319/2006: in force, consolidated 2021-07-25 after LEGE 208 21/07/2021; NEW CHANGE 2021-07-25',
        'hg-1425-2006       H.G. 1425/2006: in force, consolidated 2022-03-07; no change',
        'omai-163-2007      OMAI 163/2007: skipped, no portal id',
        '3 acts: 2 checked, 1 new change, 0 failed, 1 skipped (omai-163-2007).',
      ].join('\n')
    );
  });

  it('records a change once, however often it runs', async () => {
    const { db } = database([row(law.id, '2021-07-25', '2021-05-06')], { changeExists: true });
    const outcomes = await checkLegislation(db, [law], {
      readAct: async (portalId) => portalAct(portalId, '2021-07-25'),
      pauseMs: 0,
    });
    expect(outcomes[0]).toMatchObject({
      result: 'checked',
      change: { consolidatedOn: '2021-07-25', recorded: false },
    });
    expect(summarize(outcomes)).toContain('change 2021-07-25 already recorded');
  });

  it('checks the other acts when one page cannot be read, and reports it', async () => {
    const { db, sent } = database([row(law.id, '2021-05-06'), row(norms.id, '2016-10-21')]);
    const outcomes = await checkLegislation(db, [law, norms], {
      readAct: async (portalId) => {
        if (portalId === 73772) throw new Error('Page 73772 has no "Forme act" section.');
        return portalAct(portalId, '2022-03-07', ['HG 259 23/02/2022']);
      },
      pauseMs: 0,
    });
    expect(outcomes.map((outcome) => outcome.result)).toEqual(['failed', 'checked']);
    expect(sent('legal_acts', 'PATCH')).toHaveLength(1);
    expect(sent('legal_changes', 'POST')[0]!.body).toMatchObject({ act_id: 'hg-1425-2006' });
    expect(summarize(outcomes)).toContain(
      'Legea 319/2006: FAILED, Page 73772 has no "Forme act" section.'
    );
  });

  it('stops before reading any page when the acts cannot be saved', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ message: 'permission denied' }, { status: 401 }));
    const db = createClient<LegislationDatabase>('https://example.supabase.co', 'sb_secret_test', {
      global: { fetch: fetchMock },
      auth: { persistSession: false },
    });
    const readAct = vi.fn();
    await expect(checkLegislation(db, acts, { readAct, pauseMs: 0 })).rejects.toThrow(
      /Could not save the acts: permission denied/
    );
    expect(readAct).not.toHaveBeenCalled();
  });
});
