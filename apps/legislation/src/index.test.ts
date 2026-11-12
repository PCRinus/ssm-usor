import { legalActs } from '@ssm-usor/document-engine/citations';
import {
  type CheckRun,
  fetchPortalAct,
  runInProgress,
  runLegislationCheck,
} from '@ssm-usor/legislation-check';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import worker, { type LegislationEnv } from './index';
import { lastSucceededRunStart } from './runs';

vi.mock('@ssm-usor/legislation-check', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@ssm-usor/legislation-check')>()),
  runLegislationCheck: vi.fn(),
  runInProgress: vi.fn(),
}));

vi.mock('./runs', () => ({ lastSucceededRunStart: vi.fn() }));

const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_test' };
const controller = { cron: '17 3 * * *', scheduledTime: 0, type: 'scheduled', noRetry: () => {} };
const scheduled = (bindings: LegislationEnv) =>
  worker.scheduled(controller as unknown as ScheduledController, bindings);

const run = (status: CheckRun['status']): CheckRun => ({
  id: 'r1',
  status,
  outcomes: [],
  errors:
    status === 'failed' ? [{ act: null, kind: 'other', message: 'Could not save the acts.' }] : [],
});

beforeEach(() => vi.mocked(runInProgress).mockResolvedValue(null));

afterEach(() => {
  vi.mocked(runLegislationCheck).mockReset();
  vi.mocked(runInProgress).mockReset();
  vi.mocked(lastSucceededRunStart).mockReset();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('the daily cron', () => {
  it('checks every act the templates cite', async () => {
    vi.mocked(runLegislationCheck).mockResolvedValue(run('succeeded'));
    await scheduled(env);
    const [, acts] = vi.mocked(runLegislationCheck).mock.calls[0]!;
    expect(acts.map((act) => act.id)).toEqual(legalActs().map((act) => act.id));
    expect(acts.length).toBeGreaterThan(0);
  });

  it('fails the invocation when the run failed', async () => {
    vi.mocked(runLegislationCheck).mockResolvedValue(run('failed'));
    await expect(scheduled(env)).rejects.toThrow('The legislation check failed, run r1.');
  });

  it('reads the portal through the relay, with the Access service token', async () => {
    vi.mocked(runLegislationCheck).mockResolvedValue(run('succeeded'));
    await scheduled({
      ...env,
      LEGISLATION_RELAY_ORIGIN: 'https://legislation-relay.example.com',
      LEGISLATION_RELAY_CLIENT_ID: 'id.access',
      LEGISLATION_RELAY_CLIENT_SECRET: 'secret',
    });
    const [, , options] = vi.mocked(runLegislationCheck).mock.calls[0]!;

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 302, headers: { Location: '/Error' } }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchPortalAct(73772, options?.portal)).rejects.toThrow(/answered 302/);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://legislation-relay.example.com/Public/DetaliiDocument/73772');
    const headers = new Headers(init?.headers);
    expect(headers.get('CF-Access-Client-Id')).toBe('id.access');
    expect(headers.get('CF-Access-Client-Secret')).toBe('secret');
  });

  it('reads the portal directly when no relay is set', async () => {
    vi.mocked(runLegislationCheck).mockResolvedValue(run('succeeded'));
    await scheduled(env);
    const [, , options] = vi.mocked(runLegislationCheck).mock.calls[0]!;
    expect(options?.portal).toEqual({ origin: undefined });
  });

  it('skips the morning while another run is under way', async () => {
    vi.mocked(runInProgress).mockResolvedValue({ id: 'r0', started_at: '2026-10-09T03:10:00Z' });
    await scheduled(env);
    expect(runLegislationCheck).not.toHaveBeenCalled();
  });

  it('refuses to run without the Supabase settings', async () => {
    await expect(scheduled({ SUPABASE_URL: env.SUPABASE_URL })).rejects.toThrow(
      /SUPABASE_SECRET_KEY/
    );
    expect(runLegislationCheck).not.toHaveBeenCalled();
  });
});

describe('the notices on Discord', () => {
  const webhook = 'https://discord.example/api/webhooks/1/token';
  const withWebhook = { ...env, DISCORD_LEGISLATION_WEBHOOK: webhook, ENVIRONMENT: 'non-prod' };
  const [first, second] = legalActs().filter((act) => act.portalId !== null);
  const changed = (recorded: boolean): CheckRun['outcomes'][number] => ({
    act: first!,
    result: 'checked',
    portal: {
      portalId: first!.portalId!,
      title: first!.title ?? first!.name,
      status: 'in_force',
      consolidations: ['2026-11-06'],
      newestConsolidation: '2026-11-06',
      amendingActs: ['LEGEA 207/2026'],
    },
    change: { consolidatedOn: '2026-11-06', amendingAct: 'LEGEA 207/2026', recorded },
  });
  const failedAct: CheckRun['outcomes'][number] = {
    act: second!,
    result: 'failed',
    error: { kind: 'fetch', message: 'fetch failed' },
  };
  let discord: ReturnType<typeof vi.fn<typeof fetch>>;
  const posted = () =>
    discord.mock.calls.map(([url, init]) => {
      expect(url).toBe(webhook);
      return JSON.parse(String(init?.body)) as { content?: string; embeds?: unknown[] };
    });

  beforeEach(() => {
    discord = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', discord);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('posts nothing without a webhook, as locally', async () => {
    vi.mocked(runLegislationCheck).mockResolvedValue({
      ...run('failed'),
      outcomes: [changed(true)],
    });
    await expect(scheduled(env)).rejects.toThrow();
    expect(discord).not.toHaveBeenCalled();
    expect(lastSucceededRunStart).not.toHaveBeenCalled();
  });

  it('posts a change only the morning it is recorded, and nothing for a quiet run', async () => {
    vi.mocked(runLegislationCheck).mockResolvedValue({
      ...run('succeeded'),
      outcomes: [changed(true)],
    });
    await scheduled(withWebhook);
    expect(posted()).toEqual([
      expect.objectContaining({
        content: '📜 **New legal change** · non-prod',
        embeds: [
          expect.objectContaining({
            title: first!.name,
            url: `https://legislatie.just.ro/Public/DetaliiDocument/${first!.portalId}`,
          }),
        ],
      }),
    ]);

    discord.mockClear();
    vi.mocked(runLegislationCheck).mockResolvedValue({
      ...run('succeeded'),
      outcomes: [changed(false)],
    });
    await scheduled(withWebhook);
    expect(discord).not.toHaveBeenCalled();
    expect(lastSucceededRunStart).not.toHaveBeenCalled();
  });

  it('posts a failed run with its failed acts, and still fails the invocation', async () => {
    vi.mocked(lastSucceededRunStart).mockResolvedValue(new Date().toISOString());
    vi.mocked(runLegislationCheck).mockResolvedValue({
      id: 'r1',
      status: 'failed',
      outcomes: [failedAct],
      errors: [{ act: second!.id, kind: 'fetch', message: 'fetch failed' }],
    });
    await expect(scheduled(withWebhook)).rejects.toThrow('The legislation check failed, run r1.');
    const [message] = posted();
    expect(posted()).toHaveLength(1);
    expect(message!.content).toMatch(/^🟡 \*\*Legislation check failed\*\* · non-prod\n/);
    expect(message!.content).toContain(`${second!.name}: FAILED, fetch failed`);
  });

  it('posts a run that stopped before it could finish', async () => {
    vi.mocked(lastSucceededRunStart).mockResolvedValue(new Date().toISOString());
    vi.mocked(runLegislationCheck).mockRejectedValue(new Error('Could not start the run: timeout'));
    await expect(scheduled(withWebhook)).rejects.toThrow('Could not start the run: timeout');
    expect(posted().map((message) => message.content)).toEqual([
      '🟡 **Legislation check failed** · non-prod\nThe run stopped: Could not start the run: timeout',
    ]);
  });

  it('warns when no run has succeeded in two days', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-12T03:47:30Z') });
    vi.mocked(runLegislationCheck).mockResolvedValue(run('failed'));

    vi.mocked(lastSucceededRunStart).mockResolvedValue('2026-11-11T03:47:01Z');
    await expect(scheduled(withWebhook)).rejects.toThrow();
    expect(posted()).toHaveLength(1);

    discord.mockClear();
    vi.mocked(lastSucceededRunStart).mockResolvedValue('2026-11-10T03:47:01Z');
    await expect(scheduled(withWebhook)).rejects.toThrow();
    expect(posted().at(-1)!.content).toBe(
      '🔴 **No successful legislation check in two days** · non-prod\nThe last successful run started 2026-11-10T03:47:01Z.'
    );
  });

  it('carries on when the run log or Discord cannot be read', async () => {
    discord.mockRejectedValue(new TypeError('fetch failed'));
    vi.mocked(lastSucceededRunStart).mockRejectedValue(new Error('Could not look: timeout'));
    vi.mocked(runLegislationCheck).mockResolvedValue({
      ...run('failed'),
      outcomes: [changed(true)],
    });
    await expect(scheduled(withWebhook)).rejects.toThrow('The legislation check failed, run r1.');
    expect(console.error).toHaveBeenCalledWith('Could not look: timeout');
  });

  it('posts what a run by hand found, before the stream ends', async () => {
    vi.mocked(runLegislationCheck).mockImplementation(async (_db, _acts, options) => {
      options?.onStart?.('r1');
      return { ...run('succeeded'), outcomes: [changed(true)] };
    });
    const response = await worker.fetch(
      new Request('https://legislation.ssmusor.ro/run', {
        method: 'POST',
        headers: { Authorization: 'Bearer run-secret' },
      }) as Parameters<typeof worker.fetch>[0],
      { ...withWebhook, LEGISLATION_RUN_SECRET: 'run-secret' }
    );
    await response.text();
    expect(posted().map((message) => message.content)).toEqual([
      '📜 **New legal change** · non-prod',
    ]);
  });
});

describe('a run started by hand', () => {
  const secret = 'run-secret-0123456789';
  const withSecret = { ...env, LEGISLATION_RUN_SECRET: secret };
  const post = (bindings: LegislationEnv, init: RequestInit = {}, path = '/run') =>
    worker.fetch(
      new Request(`https://legislation.ssmusor.ro${path}`, {
        method: 'POST',
        ...init,
      }) as Parameters<typeof worker.fetch>[0],
      bindings
    );
  const bearer = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } });

  it('serves nothing but POST /run', async () => {
    for (const response of [
      await post(withSecret, bearer(secret), '/'),
      await post(withSecret, bearer(secret), '/run/'),
      await post(withSecret, { ...bearer(secret), method: 'GET' }),
    ]) {
      expect(response.status).toBe(404);
      expect(await response.text()).toBe('');
    }
    expect(runLegislationCheck).not.toHaveBeenCalled();
  });

  it('turns away a missing or wrong bearer', async () => {
    for (const init of [
      {},
      bearer(`${secret}x`),
      bearer('wrong'),
      { headers: { Authorization: secret } },
    ]) {
      const response = await post(withSecret, init);
      expect(response.status).toBe(401);
      expect(await response.text()).toBe('');
    }
    expect(runLegislationCheck).not.toHaveBeenCalled();
  });

  it('does not exist without the secret', async () => {
    const response = await post(env, bearer('undefined'));
    expect(response.status).toBe(404);
    expect(runLegislationCheck).not.toHaveBeenCalled();
  });

  it('refuses while a recent run is still running', async () => {
    vi.mocked(runInProgress).mockResolvedValue({ id: 'r0', started_at: '2026-10-09T03:17:01Z' });
    const response = await post(withSecret, bearer(secret));
    expect(response.status).toBe(409);
    expect(await response.text()).toBe('Run r0 is still running, since 2026-10-09T03:17:01Z.\n');
    expect(runLegislationCheck).not.toHaveBeenCalled();
  });

  it('streams the run: its id, a line per act, the summary and the outcome', async () => {
    const [first, second] = legalActs();
    vi.mocked(runLegislationCheck).mockImplementation(async (_db, _acts, options) => {
      options?.onStart?.('r1');
      const outcomes = [
        { act: first!, result: 'failed', error: { kind: 'fetch', message: 'fetch failed' } },
        { act: second!, result: 'skipped' },
      ] satisfies CheckRun['outcomes'];
      for (const outcome of outcomes) options?.onOutcome?.(outcome);
      return {
        ...run('failed'),
        outcomes,
        errors: [{ act: first!.id, kind: 'fetch', message: 'fetch failed' }],
      };
    });
    const response = await post(withSecret, bearer(secret));

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
    const lines = (await response.text()).trimEnd().split('\n');
    expect(lines[0]).toBe('Run r1 started.');
    expect(lines[1]).toMatch(/FAILED, fetch failed$/);
    expect(lines[2]).toMatch(/skipped, no portal id$/);
    expect(lines.slice(3)).toEqual([
      expect.stringMatching(/^2 acts: 0 checked, 0 new changes, 1 failed, 1 skipped/),
      'Failed acts by cause: 1 could not be fetched.',
      'Run r1 failed.',
    ]);
  });

  it('ends the stream with the failure when the run throws after it started', async () => {
    vi.mocked(runLegislationCheck).mockImplementation(async (_db, _acts, options) => {
      options?.onStart?.('r1');
      throw new Error('Could not record the end of run r1: connection reset');
    });
    const response = await post(withSecret, bearer(secret));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(
      'Run r1 started.\nThe run stopped: Could not record the end of run r1: connection reset\nRun r1 failed.\n'
    );
  });

  it('answers 500 when the run cannot even start', async () => {
    vi.mocked(runLegislationCheck).mockRejectedValue(
      new Error('Could not start the run: permission denied')
    );
    const response = await post(withSecret, bearer(secret));
    expect(response.status).toBe(500);
    expect(await response.text()).toBe('Could not start the run: permission denied\n');
  });
});
