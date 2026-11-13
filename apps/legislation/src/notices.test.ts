import { discordPayloads } from '@ssm-usor/discord';
import type { ChangeAssessment, CheckRun, LegalAct, PortalAct } from '@ssm-usor/legislation-check';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  changeDetails,
  changeEmbed,
  type ChangeNotice,
  changesMessage,
  changesOf,
  failedRunMessage,
  isStale,
  legislationNotices,
  notAssessedMessage,
  staleMessage,
  stoppedRunMessage,
} from './notices';

const roads: LegalAct = {
  id: 'oug-195-2002',
  kind: 'oug',
  number: '195',
  year: 2002,
  name: 'O.U.G. 195/2002',
  title:
    'Ordonanța de urgență a Guvernului nr. 195 din 12 decembrie 2002 privind circulația pe drumurile publice',
  portalId: 41006,
};
const safety: LegalAct = {
  ...roads,
  id: 'legea-319-2006',
  name: 'Legea 319/2006',
  portalId: 73772,
};
const fire: LegalAct = { ...roads, id: 'legea-307-2006', name: 'Legea 307/2006', portalId: 72727 };

const portal = (act: LegalAct, newest: string) =>
  ({
    portalId: act.portalId!,
    title: act.title!,
    status: 'in_force',
    consolidations: [newest],
    newestConsolidation: newest,
    amendingActs: [],
  }) as PortalAct;

const helmetOld =
  '(2) Pe timpul deplasării pe drumurile publice, conducătorii motocicletelor, mopedelor și persoanele transportate pe acestea au obligația să poarte casca de protecție omologată.';
const helmetNew =
  '(2) Pe timpul deplasării pe drumurile publice, conducătorii motocicletelor, mopedelor și persoanele transportate pe acestea au obligația să poarte pe cap cască de protecție omologată pentru această categorie de vehicul, cu elementele de siguranță cuplate în mod corespunzător.';

const law207 = {
  kind: 'LEGEA',
  number: '207',
  date: '2026-11-03',
  name: 'Legea 207/2026',
  portalId: null,
  gazette: { number: '905', date: '2026-11-04' },
};

const amended = (unit: string) => ({
  unit,
  subject: unit,
  operation: 'modified' as const,
  date: '2026-11-06',
  amendingAct: 'Legea 207/2026',
});

const quoteDiffers: ChangeAssessment = {
  changeId: 'c1',
  consolidatedOn: '2026-11-06',
  comparedWith: '2026-08-25',
  compared: true,
  backfilled: false,
  outcome: 'quote_differs',
  resolved: false,
  note: null,
  amendingActs: [law207],
  amendedUnits: [amended('Art. 6'), amended('Art. 36 alin. (2)')],
  review: [],
  passages: [
    {
      manifest: 'ssm',
      file: '2.2_general_training_material.docx',
      typeKey: 'general_training_material',
      paragraph: 2048,
      form: 'quote',
      locator: 'Art. 36 alin. (1) – (3)',
      article: '36',
      unit: 'Art. 36 alin. (2)',
      status: 'changed',
      old: helmetOld,
      new: helmetNew,
      hunks: [],
    },
    {
      manifest: 'ssm',
      file: '2.2_general_training_material.docx',
      typeKey: 'general_training_material',
      paragraph: 1970,
      form: 'reference',
      locator: null,
      article: '36',
      unit: 'Art. 36',
      status: 'changed',
      old: helmetOld,
      new: helmetNew,
      hunks: [],
    },
  ],
};

const needsReview: ChangeAssessment = {
  ...quoteDiffers,
  changeId: 'c2',
  backfilled: true,
  outcome: 'needs_review',
  review: ['Art. 6 is referred to and was changed.'],
  passages: [],
};

const noImpact: ChangeAssessment = {
  ...quoteDiffers,
  changeId: 'c3',
  consolidatedOn: '2026-10-25',
  comparedWith: '2026-10-18',
  outcome: 'no_impact',
  resolved: true,
  note: 'Modificarea adusă de Legea 204/2026 atinge art. 342; niciun text citat în documente nu s-a schimbat.',
  amendingActs: [{ ...law207, number: '204', name: 'Legea 204/2026' }],
  amendedUnits: [amended('Art. 342')],
  passages: [],
};

const run: CheckRun = {
  id: 'r1',
  status: 'failed',
  outcomes: [
    {
      act: roads,
      result: 'checked',
      portal: portal(roads, '2026-11-06'),
      change: {
        id: 'c1',
        consolidatedOn: '2026-11-06',
        amendingAct: 'LEGEA 207/2026',
        recorded: true,
      },
      assessments: [quoteDiffers],
    },
    {
      act: fire,
      result: 'checked',
      portal: portal(fire, '2026-10-25'),
      change: { id: null, consolidatedOn: '2026-10-25', amendingAct: null, recorded: false },
      assessments: [],
    },
    {
      act: safety,
      result: 'failed',
      error: { kind: 'http_status', status: 503, message: 'The portal answered 503.' },
    },
  ],
  errors: [
    { act: safety.id, kind: 'http_status', status: 503, message: 'The portal answered 503.' },
  ],
};

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

const notice = (assessment: ChangeAssessment | null, extra: Partial<ChangeNotice> = {}) => ({
  act: roads,
  consolidatedOn: assessment?.consolidatedOn ?? '2026-11-06',
  amendingAct: 'LEGEA 207/2026',
  assessment,
  ...extra,
});

describe('the messages', () => {
  it('finds every change assessed in the run, and a new one that could not be', () => {
    const notices = changesOf({
      ...run,
      outcomes: [
        ...run.outcomes,
        {
          act: fire,
          result: 'checked',
          portal: portal(fire, '2026-11-01'),
          change: null,
          assessments: [{ ...needsReview, consolidatedOn: '2026-11-01' }],
        },
        {
          act: safety,
          result: 'checked',
          portal: portal(safety, '2026-11-10'),
          change: { id: 'c9', consolidatedOn: '2026-11-10', amendingAct: null, recorded: true },
          assessments: [],
          assessmentError: { kind: 'fetch', message: 'Could not assess its change: fetch failed' },
        },
      ],
    });
    expect(
      notices.map((each) => [each.act.id, each.consolidatedOn, each.assessment?.outcome ?? null])
    ).toEqual([
      ['oug-195-2002', '2026-11-06', 'quote_differs'],
      ['legea-307-2006', '2026-11-01', 'needs_review'],
      ['legea-319-2006', '2026-11-10', null],
    ]);
    expect(notices[0]!.amendingAct).toBe('LEGEA 207/2026');
    expect(notices[2]!.notAssessed).toBe('Could not assess its change: fetch failed');
  });

  it('shows a quote that differs as the law’s old and new text, with the templates that quote it', () => {
    expect(discordPayloads(changesMessage([notice(quoteDiffers)], 'production'))).toEqual([
      {
        content: '📜 **New legal change** · production',
        embeds: [
          {
            title: 'O.U.G. 195/2002',
            url: 'https://legislatie.just.ro/Public/DetaliiDocument/41006',
            description: roads.title,
            color: 0xe8a317,
            fields: [
              { name: 'Consolidated on', value: '2026-11-06', inline: true },
              { name: 'Compared with', value: '2026-08-25', inline: true },
              { name: 'Outcome', value: 'Quote differs', inline: true },
              { name: 'Amending acts', value: 'Legea 207/2026', inline: true },
              { name: 'Amended units', value: 'Art. 6\nArt. 36 alin. (2)' },
            ],
          },
        ],
        allowed_mentions: { parse: [] },
      },
    ]);
    expect(changeDetails(notice(quoteDiffers))).toEqual({
      content: [
        '**O.U.G. 195/2002**, form of 2026-11-06',
        '**Art. 36 alin. (2)** · 2.2_general_training_material.docx (Art. 36 alin. (1) – (3))',
        '```diff',
        `- ${helmetOld}`,
        `+ ${helmetNew}`,
        '```',
      ].join('\n'),
    });
  });

  it('shows only the changed words of a long unit, with the words around them', () => {
    const long = 'Cuvinte de umplutură. '.repeat(60);
    const details = changeDetails(
      notice({
        ...quoteDiffers,
        passages: [
          {
            ...quoteDiffers.passages[0]!,
            old: `${long}casca de protecție`,
            new: `${long}cască de protecție omologată`,
            hunks: [
              { old: 'casca', new: 'cască', before: 'de umplutură.', after: 'de protecție' },
              { old: '', new: 'omologată', before: 'casca de protecție', after: '' },
            ],
          },
        ],
      })
    );
    expect(details!.content!.split('\n').slice(2)).toEqual([
      '```diff',
      '- … de umplutură. casca de protecție …',
      '+ … de umplutură. cască de protecție …',
      '',
      '- … casca de protecție …',
      '+ … casca de protecție omologată …',
      '```',
    ]);
  });

  it('names the act as published as the form compared with, and none when nothing was', () => {
    const fields = (assessment: ChangeAssessment) =>
      changeEmbed(notice(assessment)).fields!.find((field) => field.name === 'Compared with');
    expect(fields({ ...needsReview, comparedWith: null })!.value).toBe('the act as published');
    expect(fields({ ...needsReview, comparedWith: null, compared: false })!.value).toBe('—');
  });

  it('colours a change by its outcome and lists why it needs review', () => {
    const embed = changeEmbed(notice(needsReview));
    expect(embed.color).toBe(0xd9534f);
    expect(embed.fields![2]).toEqual({ name: 'Outcome', value: 'Needs review', inline: true });
    expect(changesMessage([notice(needsReview)], 'non-prod').content).toBe(
      '📜 **Legal change assessed** · non-prod'
    );
    expect(changeDetails(notice(needsReview))!.content).toBe(
      '**O.U.G. 195/2002**, form of 2026-11-06\n**To review**\n- Art. 6 is referred to and was changed.'
    );
  });

  it('says when a new change could not be assessed, with nothing after it', () => {
    const unassessed = notice(null, { notAssessed: 'Could not assess its change: fetch failed.' });
    expect(changeDetails(unassessed)).toBeNull();
    expect(changeEmbed(unassessed).fields).toEqual([
      { name: 'Consolidated on', value: '2026-11-06', inline: true },
      {
        name: 'Outcome',
        value: 'Not assessed: Could not assess its change: fetch failed. The next run tries again.',
        inline: false,
      },
      { name: 'Amending act', value: 'LEGEA 207/2026', inline: true },
    ]);
    expect(changeEmbed(notice(null, { amendingAct: null })).fields![2]).toEqual({
      name: 'Amending act',
      value: '—',
      inline: true,
    });
  });

  it('lists the acts of a failed run, each as the run log describes it', () => {
    const { content } = failedRunMessage(run, 'non-prod');
    expect(content).toBe(
      [
        '🟡 **Legislation check failed** · non-prod',
        '3 acts: 2 checked, 1 new change, 1 failed, 0 skipped.',
        'Failed acts by cause: 1 answered 503.',
        'Run r1 failed.',
        '```',
        'legea-319-2006     Legea 319/2006: FAILED, The portal answered 503.',
        '```',
      ].join('\n')
    );
  });

  it('lists ten failed acts at most', () => {
    const failed = Array.from({ length: 13 }, (_, index): CheckRun['outcomes'][number] => ({
      act: { ...safety, id: `lege-${index + 1}-2000`, name: `Legea ${index + 1}/2000` },
      result: 'failed',
      error: { kind: 'fetch', message: 'fetch failed' },
    }));
    const lines = failedRunMessage({ ...run, outcomes: failed }, 'production').content!.split('\n');
    expect(lines.filter((line) => line.includes('FAILED'))).toHaveLength(10);
    expect(lines.at(-2)).toBe('and 3 more');
  });

  it('lists the acts whose earlier changes were not assessed, or left for the next run', () => {
    const outcomes: CheckRun['outcomes'] = [
      {
        act: safety,
        result: 'checked',
        portal: portal(safety, '2026-11-10'),
        change: null,
        assessments: [],
        assessmentError: { kind: 'fetch', message: 'Could not assess its change: fetch failed' },
      },
      {
        act: roads,
        result: 'checked',
        portal: portal(roads, '2026-11-06'),
        change: { id: 'c1', consolidatedOn: '2026-11-06', amendingAct: null, recorded: true },
        assessments: [],
        assessmentError: { kind: 'fetch', message: 'Could not assess its change: fetch failed' },
      },
      {
        act: fire,
        result: 'checked',
        portal: portal(fire, '2026-10-25'),
        change: null,
        assessments: [],
        deferred: ['2026-10-25'],
      },
    ];
    expect(notAssessedMessage({ ...run, status: 'succeeded', outcomes }, 'production')).toEqual({
      content: [
        '🟡 **Legal changes not assessed** · production',
        'The next run tries again; a change that fails for three days is left to review.',
        '```',
        'legea-319-2006     Legea 319/2006: in force, consolidated 2026-11-10; no change; ASSESSMENT FAILED, Could not assess its change: fetch failed',
        'legea-307-2006     Legea 307/2006: in force, consolidated 2026-10-25; no change; 2026-10-25 left for the next run, out of time',
        '```',
      ].join('\n'),
    });
    expect(notAssessedMessage(run, 'production')).toBeNull();
  });

  it('says why a run stopped', () => {
    expect(stoppedRunMessage('Could not save the acts: timeout', 'production').content).toBe(
      '🟡 **Legislation check failed** · production\nThe run stopped: Could not save the acts: timeout'
    );
  });

  it('warns of two days without a successful run', () => {
    expect(staleMessage('2026-11-10T03:17:02Z', 'production').content).toBe(
      '🔴 **No successful legislation check in two days** · production\nThe last successful run started 2026-11-10T03:17:02Z.'
    );
    expect(staleMessage(null, 'non-prod').content).toMatch(/No run has succeeded/);
  });

  it('counts two days from the start of the last successful run, less an hour', () => {
    const now = Date.parse('2026-11-12T03:17:30Z');
    expect(isStale('2026-11-11T03:17:00Z', now)).toBe(false);
    expect(isStale('2026-11-10T04:20:00Z', now)).toBe(false);
    expect(isStale('2026-11-10T03:17:05Z', now)).toBe(true);
    expect(isStale(null, now)).toBe(true);
  });
});

describe('legislationNotices', () => {
  it('posts nothing without a webhook', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const notices = legislationNotices({ ENVIRONMENT: 'production' }, fetcher);
    expect(notices.enabled).toBe(false);
    await notices.ran(run);
    await notices.stopped('reason');
    await notices.stale(null);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('posts each new change, then the failure, named for a Worker without an environment local', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }));
    await legislationNotices(
      { DISCORD_LEGISLATION_WEBHOOK: 'https://discord.example/w' },
      fetcher
    ).ran(run);
    const contents = fetcher.mock.calls.map(([, init]) => JSON.parse(String(init?.body)).content);
    expect(contents).toEqual([
      '📜 **New legal change** · local',
      expect.stringMatching(
        /^\*\*O\.U\.G\. 195\/2002\*\*, form of 2026-11-06\n\*\*Art\. 36 alin\. \(2\)\*\*/
      ),
      expect.stringMatching(/^🟡 \*\*Legislation check failed\*\* · local\n/),
    ]);
  });

  it('puts the changes resolved as no impact in one post, a line each, after the others', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }));
    await legislationNotices(
      { DISCORD_LEGISLATION_WEBHOOK: 'https://discord.example/w', ENVIRONMENT: 'non-prod' },
      fetcher
    ).ran({
      ...run,
      status: 'succeeded',
      outcomes: [
        {
          act: { ...roads, id: 'lege-227-2015', name: 'Legea 227/2015' },
          result: 'checked',
          portal: portal(roads, '2026-10-25'),
          change: null,
          assessments: [noImpact],
        },
        {
          act: fire,
          result: 'checked',
          portal: portal(fire, '2026-10-25'),
          change: null,
          assessments: [{ ...noImpact, amendedUnits: [], amendingActs: [] }],
        },
      ],
      errors: [],
    });
    const contents = fetcher.mock.calls.map(([, init]) => JSON.parse(String(init?.body)).content);
    expect(contents).toEqual([
      [
        '✅ **Resolved, no impact** · non-prod: Legea 227/2015, form of 2026-10-25, Art. 342 (Legea 204/2026)',
        '✅ **Resolved, no impact** · non-prod: Legea 307/2006, form of 2026-10-25, no unit named',
      ].join('\n'),
    ]);
  });

  it('posts a morning of many changes ten to a message', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }));
    const recorded = (index: number): CheckRun['outcomes'][number] => ({
      act: { ...roads, id: `act-${index}`, name: `Act ${index}` },
      result: 'checked',
      portal: portal(roads, '2026-11-06'),
      change: { id: `c${index}`, consolidatedOn: '2026-11-06', amendingAct: null, recorded: true },
      assessments: [],
    });
    await legislationNotices(
      { DISCORD_LEGISLATION_WEBHOOK: 'https://discord.example/w', ENVIRONMENT: 'production' },
      fetcher
    ).ran({
      ...run,
      status: 'succeeded',
      outcomes: Array.from({ length: 23 }, (_, i) => recorded(i)),
      errors: [],
    });
    const posts = fetcher.mock.calls.map(([, init]) => JSON.parse(String(init?.body)));
    expect(posts.map((post) => post.embeds.length)).toEqual([10, 10, 3]);
    expect(posts.map((post) => post.content)).toEqual([
      '📜 **23 new legal changes** · production',
      undefined,
      undefined,
    ]);
    expect(
      posts.flatMap((post) => post.embeds.map((embed: { title: string }) => embed.title))
    ).toEqual(Array.from({ length: 23 }, (_, i) => `Act ${i}`));
  });

  it('carries on when Discord fails', async () => {
    const notices = legislationNotices(
      { DISCORD_LEGISLATION_WEBHOOK: 'https://discord.example/w' },
      async () => {
        throw new TypeError('fetch failed');
      }
    );
    await expect(notices.ran(run)).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith(
      'A legislation notice was not posted: fetch failed.'
    );
  });
});
