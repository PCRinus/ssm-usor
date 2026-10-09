import { readFileSync } from 'node:fs';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { legalActsSchema } from './check';
import { createLegislationClient } from './database';
import { type PortalAct, PortalError } from './portal';
import { describeRun, runLegislationCheck } from './run';

const { acts } = legalActsSchema.parse(
  JSON.parse(readFileSync(new URL('../fixtures/legal-acts.json', import.meta.url), 'utf8'))
);

const portalAct = (portalId: number, newest: string) =>
  ({
    portalId,
    title: 'LEGE',
    status: 'in_force',
    consolidations: [newest],
    newestConsolidation: newest,
    amendingActs: [],
  }) satisfies PortalAct;

function database(options: { saveActs?: boolean; startRun?: boolean } = {}) {
  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    if (url.pathname === '/rest/v1/legal_check_runs' && method === 'POST') {
      return options.startRun === false
        ? Response.json({ message: 'permission denied' }, { status: 401 })
        : Response.json({ id: 'r1' }, { status: 201 });
    }
    if (url.pathname === '/rest/v1/legal_check_runs' && method === 'PATCH') {
      return new Response(null, { status: 204 });
    }
    if (url.pathname === '/rest/v1/legal_acts' && method === 'POST') {
      return options.saveActs === false
        ? Response.json({ message: 'relation "legal_acts" does not exist' }, { status: 404 })
        : Response.json([
            {
              id: 'lege-319-2006',
              last_consolidated_on: '2021-05-06',
              verified_consolidated_on: null,
            },
            {
              id: 'hg-1425-2006',
              last_consolidated_on: '2022-03-07',
              verified_consolidated_on: null,
            },
            { id: 'omai-163-2007', last_consolidated_on: null, verified_consolidated_on: null },
          ]);
    }
    if (url.pathname === '/rest/v1/legal_acts' && method === 'PATCH') {
      return new Response(null, { status: 204 });
    }
    if (url.pathname === '/rest/v1/legal_changes' && method === 'POST') {
      return Response.json([{ id: 'c1' }], { status: 201 });
    }
    throw new Error(`Unexpected request: ${method} ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  const db = createLegislationClient('https://example.supabase.co', 'sb_secret_test');
  const runEnd = () => {
    const call = fetchMock.mock.calls.find(
      ([input, init]) =>
        new URL(String(input)).pathname === '/rest/v1/legal_check_runs' && init?.method === 'PATCH'
    );
    return call && { url: new URL(String(call[0])), body: JSON.parse(String(call[1]?.body)) };
  };
  return { db, runEnd };
}

afterEach(() => vi.unstubAllGlobals());

describe('a run of the check', () => {
  it('ends succeeded with what it checked, found and skipped', async () => {
    const { db, runEnd } = database();
    const run = await runLegislationCheck(db, acts, {
      readAct: async (portalId) =>
        portalAct(portalId, portalId === 73772 ? '2021-07-25' : '2022-03-07'),
      pauseMs: 0,
    });

    expect(run).toMatchObject({ id: 'r1', status: 'succeeded', errors: [] });
    const end = runEnd()!;
    expect(end.url.searchParams.get('id')).toBe('eq.r1');
    expect(end.body).toMatchObject({
      status: 'succeeded',
      acts_checked: 2,
      changes_found: 1,
      acts_skipped: 1,
      errors: null,
    });
    expect(Date.parse(end.body.finished_at)).not.toBeNaN();
    expect(describeRun(run)).toMatch(/1 new change, 0 failed, 1 skipped .*\nRun r1 succeeded\.$/);
  });

  it('ends failed with one error per act it could not read, after checking the others', async () => {
    const { db, runEnd } = database();
    const run = await runLegislationCheck(db, acts, {
      readAct: async (portalId) => {
        if (portalId === 76337) {
          throw new PortalError(
            'https://legislatie.just.ro/Public/DetaliiDocument/76337 answered 520.',
            {
              kind: 'http_status',
              status: 520,
            }
          );
        }
        return portalAct(portalId, '2021-05-06');
      },
      pauseMs: 0,
    });

    expect(run.status).toBe('failed');
    expect(runEnd()!.body).toMatchObject({
      status: 'failed',
      acts_checked: 1,
      changes_found: 0,
      acts_skipped: 1,
      errors: [
        {
          act: 'hg-1425-2006',
          kind: 'http_status',
          status: 520,
          message: 'https://legislatie.just.ro/Public/DetaliiDocument/76337 answered 520.',
        },
      ],
    });
    expect(describeRun(run)).toContain('Failed acts by cause: 1 answered 520.');
  });

  it('ends failed when the check itself throws', async () => {
    const { db, runEnd } = database({ saveActs: false });
    const readAct = vi.fn();
    const run = await runLegislationCheck(db, acts, { readAct, pauseMs: 0 });

    expect(readAct).not.toHaveBeenCalled();
    expect(runEnd()!.body).toMatchObject({
      status: 'failed',
      acts_checked: 0,
      errors: [
        {
          act: null,
          kind: 'other',
          message: 'Could not save the acts: relation "legal_acts" does not exist',
        },
      ],
    });
    expect(describeRun(run)).toBe(
      'The run stopped: Could not save the acts: relation "legal_acts" does not exist\nRun r1 failed.'
    );
  });

  it('reads no act when the run cannot be recorded', async () => {
    const { db, runEnd } = database({ startRun: false });
    const readAct = vi.fn();
    await expect(runLegislationCheck(db, acts, { readAct, pauseMs: 0 })).rejects.toThrow(
      /Could not start the run: permission denied/
    );
    expect(readAct).not.toHaveBeenCalled();
    expect(runEnd()).toBeUndefined();
  });
});
