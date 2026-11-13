import { readFileSync } from 'node:fs';

import { createClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import {
  amendedUnitsOf,
  defaultReadForm,
  type IndexedCitation,
  noImpactNote,
  readableUnit,
} from './assess';
import { checkLegislation, describeOutcome, type LegalAct, summarize } from './check';
import type { LegislationDatabase } from './database';
import { type PortalAct, PortalError } from './portal';
import { describeRun, runLegislationCheck } from './run';

const fixture = (name: string) =>
  readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');

const roads: LegalAct = {
  id: 'oug-195-2002',
  kind: 'oug',
  number: 195,
  year: 2002,
  name: 'O.U.G. 195/2002',
  title: 'privind circulația pe drumurile publice',
  portalId: 41006,
};

const published = fixture('oug-195-2002-2026-08-25.html').replace(
  "<a title='Consolidarea din 25.08.2026' style='color:#428BCA'>",
  "<a title='Consolidarea din 25.08.2026' href='~/../../../Public/DetaliiDocument/312713'>"
);

const portal = {
  fetch: vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input));
    const path = `${url.pathname}${url.search}`;
    const pages: Record<string, string> = {
      '/Public/DetaliiDocument/41006': fixture('oug-195-2002-text.html'),
      '/Public/DetaliiDocument/41006?isFormaDeBaza=True': published,
      '/Public/DetaliiDocument/312713': fixture('oug-195-2002-2026-08-25.html'),
    };
    return pages[path] === undefined
      ? new Response('', { status: 302 })
      : new Response(pages[path], { status: 200 });
  }),
  pauseMs: 0,
};

const helmet: IndexedCitation = {
  manifest: 'ssm',
  file: '2.2_general_training_material.docx',
  typeKey: 'general_training_material',
  paragraph: 2048,
  form: 'quote',
  act: roads.id,
  article: '36',
  locator: 'Art. 36 alin. (2)',
  text: '(2) Pe timpul deplasării pe drumurile publice, conducătorii motocicletelor, mopedelor și persoanele transportate pe acestea au obligația să poarte casca de protecție omologată.',
};
const purpose: IndexedCitation = {
  ...helmet,
  paragraph: 1965,
  article: '1',
  locator: 'Art. 1 alin. (1)',
  text: '(1) Circulația pe drumurile publice a vehiculelor, pietonilor și a celorlalte categorii de participanți la trafic, drepturile, obligațiile și răspunderile care revin persoanelor fizice și juridice, precum și atribuțiile unor autorități ale administrației publice, instituții și organizații sunt supuse dispozițiilor prevăzute în prezenta ordonanță de urgență.',
};
const definitions: IndexedCitation = {
  ...helmet,
  paragraph: 1970,
  form: 'reference',
  article: '36',
  locator: null,
  text: null,
};

const today = Date.parse('2026-11-13T03:17:00Z');
const recently = '2026-11-12T03:17:00Z';
const longAgo = '2026-11-08T03:17:00Z';

const unreachable = new PortalError('https://relay/Public/DetaliiDocument/312713 answered 403.', {
  kind: 'http_status',
  status: 403,
});

const newest = (newestConsolidation: string): PortalAct => ({
  portalId: 41006,
  title: 'ORDONANȚĂ DE URGENȚĂ nr. 195 din 12 decembrie 2002',
  status: 'in_force',
  consolidations: [newestConsolidation, '2026-08-25'],
  newestConsolidation,
  amendingActs: ['LEGE 207 03/11/2026'],
});

type Pending = { id: string; act_id: string; consolidated_on: string; seen_at: string };

function database({
  lastSeen,
  verified,
  pending = [],
  outcomeTaken = false,
  advanceFails = false,
}: {
  lastSeen: string | null;
  verified: string | null;
  pending?: Pending[];
  outcomeTaken?: boolean;
  advanceFails?: boolean;
}) {
  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const table = url.pathname.replace('/rest/v1/', '');
    if (table === 'legal_acts' && method === 'POST') {
      return Response.json([
        {
          id: roads.id,
          last_consolidated_on: lastSeen,
          verified_consolidated_on: verified,
          last_checked_at: '2026-11-12T03:17:00Z',
        },
      ]);
    }
    if (table === 'legal_changes' && method === 'GET') return Response.json(pending);
    if (table === 'legal_changes' && method === 'POST') {
      return Response.json([{ id: 'c-new' }], { status: 201 });
    }
    if (table === 'legal_changes' && method === 'PATCH') {
      return Response.json(outcomeTaken ? [] : [{ id: url.searchParams.get('id')?.slice(3) }]);
    }
    if (table === 'legal_acts' && method === 'PATCH' && advanceFails) {
      const body = JSON.parse(String(init?.body));
      if ('verified_consolidated_on' in body) {
        return Response.json(
          { message: 'canceling statement due to statement timeout' },
          { status: 500 }
        );
      }
    }
    if (table === 'legal_check_runs' && method === 'POST') {
      return Response.json({ id: 'r1' }, { status: 201 });
    }
    if (method === 'PATCH' || method === 'DELETE') return new Response(null, { status: 204 });
    if (table === 'legal_change_passages' && method === 'POST') {
      return new Response(null, { status: 201 });
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
        return url.pathname === `/rest/v1/${table}` && (init?.method ?? 'GET') === method;
      })
      .map(([input, init]) => ({
        url: new URL(String(input)),
        body: init?.body ? JSON.parse(String(init.body)) : null,
      }));
  return { db, sent };
}

const check = (
  db: ReturnType<typeof database>['db'],
  citations: IndexedCitation[],
  form = '2026-11-06'
) =>
  checkLegislation(db, [roads], {
    readAct: async () => newest(form),
    citations,
    portal,
    pauseMs: 0,
  });

describe('assessing a new form', () => {
  it('stores a quote that differs with the law’s old and new text, and leaves the change open', async () => {
    const { db, sent } = database({ lastSeen: '2026-08-25', verified: '2026-08-25' });
    const [outcome] = await check(db, [helmet, purpose, definitions]);

    expect(sent('legal_changes', 'POST')[0]!.body).toMatchObject({
      act_id: roads.id,
      consolidated_on: '2026-11-06',
    });
    expect(sent('legal_change_passages', 'DELETE')[0]!.url.searchParams.get('change_id')).toBe(
      'eq.c-new'
    );
    const passages = sent('legal_change_passages', 'POST')[0]!.body as Record<string, unknown>[];
    expect(passages).toEqual([
      expect.objectContaining({
        change_id: 'c-new',
        template_file: '2.2_general_training_material.docx',
        type_key: 'general_training_material',
        paragraph: 2048,
        citation_form: 'quote',
        locator: 'Art. 36 alin. (2)',
        unit_label: 'Art. 36 alin. (2)',
        status: 'changed',
        old_text: expect.stringMatching(/să poarte casca de protecție omologată\.$/),
        new_text: expect.stringMatching(/să poarte pe cap cască de protecție omologată pentru/),
      }),
      expect.objectContaining({
        paragraph: 1970,
        citation_form: 'reference',
        unit_label: 'Art. 36',
        status: 'changed',
      }),
    ]);
    expect(passages[0]!.hunks).toContainEqual(
      expect.objectContaining({ old: 'casca', new: 'pe cap cască' })
    );

    const [stored] = sent('legal_changes', 'PATCH');
    expect(stored!.url.searchParams.get('id')).toBe('eq.c-new');
    expect(stored!.url.searchParams.get('outcome')).toBe('is.null');
    expect(stored!.body).toMatchObject({
      outcome: 'quote_differs',
      compared_with: '2026-08-25',
      review: ['Art. 36 is referred to and was changed.'],
      amending_acts: [expect.objectContaining({ name: 'Legea 207/2026' })],
      amended_units: expect.arrayContaining([
        expect.objectContaining({ unit: 'Art. 36 alin. (2)', operation: 'modified' }),
      ]),
    });
    expect(stored!.body).not.toHaveProperty('resolution');
    expect(
      sent('legal_acts', 'PATCH').filter((update) => 'verified_consolidated_on' in update.body)
    ).toHaveLength(0);

    expect(outcome).toMatchObject({
      result: 'checked',
      assessments: [{ changeId: 'c-new', outcome: 'quote_differs', backfilled: false }],
    });
    expect(describeOutcome(outcome!)).toMatch(/NEW CHANGE 2026-11-06; 2026-11-06 QUOTE DIFFERS$/);
  });

  it('resolves a change that touches nothing cited and moves the verified form to it', async () => {
    const { db, sent } = database({ lastSeen: '2026-08-25', verified: '2026-08-25' });
    const [outcome] = await check(db, [purpose]);

    expect(sent('legal_change_passages', 'POST')).toHaveLength(0);
    const [stored] = sent('legal_changes', 'PATCH');
    expect(stored!.body).toMatchObject({
      outcome: 'no_impact',
      resolution: 'no_impact',
      resolved_by_note:
        'Modificarea adusă de Legea 207/2026 atinge art. 36 alin. (2); niciun text citat în documente nu s-a schimbat.',
    });
    expect(stored!.body.resolved_at).toBe(stored!.body.assessed_at);
    const advanced = sent('legal_acts', 'PATCH').find(
      (update) => 'verified_consolidated_on' in update.body
    );
    expect(advanced!.body).toEqual({ verified_consolidated_on: '2026-11-06' });
    expect(advanced!.url.searchParams.get('or')).toBe(
      '(verified_consolidated_on.is.null,verified_consolidated_on.lt.2026-11-06)'
    );
    expect(describeOutcome(outcome!)).toMatch(/2026-11-06 resolved, no impact$/);
  });

  it('leaves the verified form alone when another run already recorded the outcome', async () => {
    const { db, sent } = database({
      lastSeen: '2026-08-25',
      verified: '2026-08-25',
      outcomeTaken: true,
    });
    await check(db, [purpose]);

    expect(sent('legal_changes', 'PATCH')).toHaveLength(1);
    expect(
      sent('legal_acts', 'PATCH').filter((update) => 'verified_consolidated_on' in update.body)
    ).toHaveLength(0);
  });

  it('assesses a change recorded on an earlier run that was never assessed', async () => {
    const { db, sent } = database({
      lastSeen: '2026-11-06',
      verified: '2026-08-25',
      pending: [
        { id: 'c-old', act_id: roads.id, consolidated_on: '2026-11-06', seen_at: recently },
      ],
    });
    const [outcome] = await check(db, [helmet]);

    const [query] = sent('legal_changes', 'GET');
    expect(query!.url.searchParams.get('resolution')).toBe('eq.open');
    expect(query!.url.searchParams.get('outcome')).toBe('is.null');
    expect(sent('legal_changes', 'POST')).toHaveLength(0);
    expect(sent('legal_changes', 'PATCH')[0]!.url.searchParams.get('id')).toBe('eq.c-old');
    expect(outcome).toMatchObject({
      result: 'checked',
      change: null,
      assessments: [{ changeId: 'c-old', outcome: 'quote_differs', backfilled: true }],
    });
  });

  it('leaves a change unassessed when a form cannot be read, the act checked and the run not failed', async () => {
    const { db, sent } = database({ lastSeen: '2026-08-25', verified: '2026-08-25' });
    const run = await runLegislationCheck(db, [roads], {
      readAct: async () => newest('2026-11-06'),
      readForm: async () => {
        throw unreachable;
      },
      citations: [helmet],
      pauseMs: 0,
    });

    const [outcome] = run.outcomes;
    expect(outcome).toMatchObject({
      result: 'checked',
      change: { id: 'c-new', consolidatedOn: '2026-11-06', recorded: true },
      assessments: [],
      assessmentError: {
        kind: 'http_status',
        status: 403,
        message:
          'Could not assess its change: https://relay/Public/DetaliiDocument/312713 answered 403.',
      },
    });
    expect(run.status).toBe('succeeded');
    expect(describeRun(run)).toContain(
      'NEW CHANGE 2026-11-06; ASSESSMENT FAILED, Could not assess its change: https://relay/Public/DetaliiDocument/312713 answered 403.'
    );
    expect(describeRun(run)).toContain(
      '1 acts: 1 checked, 1 new change, 0 failed, 0 skipped. 1 act with a change that could not be assessed.'
    );
    expect(sent('legal_changes', 'PATCH')).toHaveLength(0);
    expect(sent('legal_acts', 'PATCH')[0]!.body).toMatchObject({
      last_consolidated_on: '2026-11-06',
    });
  });

  it('leaves a change that failed for three days to a person, and assesses the newer ones', async () => {
    const { db, sent } = database({
      lastSeen: '2026-11-06',
      verified: '2026-08-25',
      pending: [
        { id: 'c-stuck', act_id: roads.id, consolidated_on: '2026-09-10', seen_at: longAgo },
        { id: 'c-old', act_id: roads.id, consolidated_on: '2026-11-06', seen_at: longAgo },
      ],
    });
    const [outcome] = await checkLegislation(db, [roads], {
      readAct: async () => newest('2026-11-06'),
      readForm: async (portalId, on) => {
        if (on === '2026-09-10') throw unreachable;
        return defaultReadForm(portal)(portalId, on);
      },
      citations: [helmet],
      pauseMs: 0,
      now: () => today,
    });

    const [stuck, old] = sent('legal_changes', 'PATCH');
    expect(stuck!.url.searchParams.get('id')).toBe('eq.c-stuck');
    expect(stuck!.body).toMatchObject({
      outcome: 'needs_review',
      compared_with: null,
      review: [
        'The check could not assess it in any run since 2026-11-08: https://relay/Public/DetaliiDocument/312713 answered 403.',
      ],
    });
    expect(old!.url.searchParams.get('id')).toBe('eq.c-old');
    expect(old!.body).toMatchObject({ outcome: 'quote_differs' });
    expect(outcome).toMatchObject({
      result: 'checked',
      assessments: [
        { changeId: 'c-stuck', outcome: 'needs_review', compared: false },
        { changeId: 'c-old', outcome: 'quote_differs' },
      ],
    });
    expect(outcome).not.toHaveProperty('assessmentError');
  });

  it('tries a change that failed for less than three days again on the next run', async () => {
    const { db, sent } = database({
      lastSeen: '2026-11-06',
      verified: '2026-08-25',
      pending: [
        { id: 'c-stuck', act_id: roads.id, consolidated_on: '2026-09-10', seen_at: recently },
        { id: 'c-old', act_id: roads.id, consolidated_on: '2026-11-06', seen_at: recently },
      ],
    });
    const [outcome] = await checkLegislation(db, [roads], {
      readAct: async () => newest('2026-11-06'),
      readForm: async () => {
        throw unreachable;
      },
      citations: [helmet],
      pauseMs: 0,
      now: () => today,
    });
    expect(sent('legal_changes', 'PATCH')).toHaveLength(0);
    expect(outcome).toMatchObject({ result: 'checked', assessments: [] });
    expect(outcome).toHaveProperty('assessmentError');
  });

  it('reports a change resolved when only advancing the verified form failed', async () => {
    const { db } = database({ lastSeen: '2026-08-25', verified: '2026-08-25', advanceFails: true });
    const [outcome] = await check(db, [purpose]);
    expect(outcome).toMatchObject({
      result: 'checked',
      assessments: [{ changeId: 'c-new', outcome: 'no_impact', resolved: true }],
      warnings: [
        'Could not advance the verified form to 2026-11-06: canceling statement due to statement timeout',
      ],
    });
    expect(outcome).not.toHaveProperty('assessmentError');
    expect(describeOutcome(outcome!)).toMatch(
      /2026-11-06 resolved, no impact; warning: Could not advance the verified form to 2026-11-06/
    );
  });

  it('leaves the changes past the run’s time for assessing to the next run', async () => {
    const { db, sent } = database({ lastSeen: '2026-08-25', verified: '2026-08-25' });
    let clock = today;
    const outcomes = await checkLegislation(db, [roads], {
      readAct: async () => newest('2026-11-06'),
      citations: [helmet],
      portal,
      pauseMs: 0,
      assessForMs: 60_000,
      now: () => (clock += 61_000),
    });
    expect(sent('legal_changes', 'PATCH')).toHaveLength(0);
    expect(outcomes[0]).toMatchObject({
      result: 'checked',
      assessments: [],
      deferred: ['2026-11-06'],
    });
    expect(summarize(outcomes)).toMatch(
      /NEW CHANGE 2026-11-06; 2026-11-06 left for the next run, out of time\n.*skipped\. 1 change left for the next run, out of time\.$/
    );
  });

  it('names the open changes no newer than the verified form, which it leaves alone', async () => {
    const { db, sent } = database({
      lastSeen: '2026-11-06',
      verified: '2026-11-06',
      pending: [
        { id: 'c-old', act_id: roads.id, consolidated_on: '2026-08-25', seen_at: recently },
      ],
    });
    const [outcome] = await check(db, [helmet]);
    expect(sent('legal_changes', 'PATCH')).toHaveLength(0);
    expect(outcome).toMatchObject({ result: 'checked', assessments: [], passed: ['2026-08-25'] });
    expect(describeOutcome(outcome!)).toMatch(
      /; 2026-08-25 open but no newer than the verified form, not assessed$/
    );
  });

  it('refuses to compare a form the portal no longer lists', async () => {
    const { db, sent } = database({ lastSeen: '2026-08-25', verified: '2026-08-25' });
    const [outcome] = await check(db, [helmet], '2026-11-07');
    expect(outcome).toMatchObject({
      result: 'checked',
      assessmentError: { message: expect.stringMatching(/has no form of 2026-11-07 to compare/) },
    });
    expect(sent('legal_changes', 'PATCH')).toHaveLength(0);
  });

  it('compares the act as published when no form of the act is verified', async () => {
    const { db, sent } = database({ lastSeen: '2026-08-25', verified: null });
    const [outcome] = await check(db, [helmet]);
    expect(
      portal.fetch.mock.calls.some(([input]) => String(input).endsWith('?isFormaDeBaza=True'))
    ).toBe(true);
    expect(sent('legal_changes', 'PATCH')[0]!.body).toMatchObject({
      outcome: 'quote_differs',
      compared_with: null,
      review: [],
    });
    expect(outcome).toMatchObject({
      assessments: [{ comparedWith: null, compared: true, outcome: 'quote_differs' }],
    });
  });

  it('asks for review when the act as published has no text to compare', async () => {
    const { db, sent } = database({ lastSeen: '2026-08-25', verified: null });
    await checkLegislation(db, [roads], {
      readAct: async () => newest('2026-11-06'),
      readForm: async (portalId, on) => {
        if (on === null)
          throw new PortalError(`The text 41006 of page ${portalId} holds no articles.`);
        return defaultReadForm(portal)(portalId, on);
      },
      citations: [helmet],
      pauseMs: 0,
    });
    expect(sent('legal_changes', 'PATCH')[0]!.body).toMatchObject({
      outcome: 'needs_review',
      compared_with: null,
      review: [expect.stringMatching(/act as published could not be read .*holds no articles/)],
    });
  });

  it('assesses nothing without the citation index', async () => {
    const { db, sent } = database({ lastSeen: '2026-08-25', verified: '2026-08-25' });
    const [outcome] = await checkLegislation(db, [roads], {
      readAct: async () => newest('2026-11-06'),
      pauseMs: 0,
    });
    expect(sent('legal_changes', 'GET')).toHaveLength(0);
    expect(sent('legal_changes', 'PATCH')).toHaveLength(0);
    expect(outcome).toMatchObject({ result: 'checked', assessments: [] });
  });
});

describe('the words of an assessment', () => {
  it('names the unit a note names, below the units it sits in', () => {
    const note = {
      date: '2026-11-06',
      dated: 'in_force' as const,
      path: { annex: null, article: '36', alineat: '2', letter: null, point: null },
      named: { annex: null, article: null, alineat: null, letter: 'c', point: null },
      subject: 'Litera c)',
      operation: 'modified' as const,
      verb: 'modificată',
      provision: null,
      amendingAct: null,
      text: '',
    };
    expect(amendedUnitsOf([note, note])).toEqual([
      {
        unit: 'Art. 36 alin. (2) lit. c)',
        subject: 'Litera c)',
        operation: 'modified',
        date: '2026-11-06',
        amendingAct: null,
      },
    ]);
  });

  it('writes the note of a change with no impact in Romanian, the list kept short', () => {
    const units = Array.from({ length: 10 }, (_, index) => ({
      unit: `Art. ${index + 1}^1`,
      subject: '',
      operation: 'inserted' as const,
      date: '2026-11-06',
      amendingAct: null,
    }));
    expect(noImpactNote(units, [])).toBe(
      'Modificarea atinge art. 1¹, art. 2¹, art. 3¹, art. 4¹, art. 5¹, art. 6¹, art. 7¹, art. 8¹ și încă 2; niciun text citat în documente nu s-a schimbat.'
    );
    expect(noImpactNote([], [])).toBe('Niciun text citat în documente nu s-a schimbat.');
    expect(readableUnit('Anexa 2, Art. 98')).toBe('anexa 2, art. 98');
  });
});
