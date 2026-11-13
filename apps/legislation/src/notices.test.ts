import { discordPayloads } from '@ssm-usor/discord';
import type { CheckRun, LegalAct, PortalAct } from '@ssm-usor/legislation-check';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  changesMessage,
  changesOf,
  failedRunMessage,
  isStale,
  legislationNotices,
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

const run: CheckRun = {
  id: 'r1',
  status: 'failed',
  outcomes: [
    {
      act: roads,
      result: 'checked',
      portal: portal(roads, '2026-11-06'),
      change: { consolidatedOn: '2026-11-06', amendingAct: 'LEGEA 207/2026', recorded: true },
    },
    {
      act: fire,
      result: 'checked',
      portal: portal(fire, '2026-10-25'),
      change: { consolidatedOn: '2026-10-25', amendingAct: null, recorded: false },
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

describe('the messages', () => {
  it('names a change with its act, form, amending act and portal page', () => {
    const [change] = changesOf(run);
    expect(changesOf(run)).toHaveLength(1);
    expect(discordPayloads(changesMessage([change!], 'production'))).toEqual([
      {
        content: '📜 **New legal change** · production',
        embeds: [
          {
            title: 'O.U.G. 195/2002',
            url: 'https://legislatie.just.ro/Public/DetaliiDocument/41006',
            description: roads.title,
            color: 0x2f6fde,
            fields: [
              { name: 'Consolidated on', value: '2026-11-06', inline: true },
              { name: 'Amending act', value: 'LEGEA 207/2026', inline: true },
            ],
          },
        ],
        allowed_mentions: { parse: [] },
      },
    ]);
    const unnamed = changesMessage([{ ...change!, amendingAct: null }], 'non-prod');
    expect(unnamed.content).toBe('📜 **New legal change** · non-prod');
    expect(unnamed.embeds![0]!.fields![1]).toEqual({
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
      expect.stringMatching(/^🟡 \*\*Legislation check failed\*\* · local\n/),
    ]);
  });

  it('posts a morning of many changes ten to a message', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }));
    const recorded = (index: number): CheckRun['outcomes'][number] => ({
      act: { ...roads, id: `act-${index}`, name: `Act ${index}` },
      result: 'checked',
      portal: portal(roads, '2026-11-06'),
      change: { consolidatedOn: '2026-11-06', amendingAct: null, recorded: true },
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
