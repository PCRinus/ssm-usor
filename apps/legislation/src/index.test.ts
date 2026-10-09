import { legalActs } from '@ssm-usor/document-engine/citations';
import {
  type CheckRun,
  fetchPortalAct,
  runInProgress,
  runLegislationCheck,
} from '@ssm-usor/legislation-check';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import worker, { type LegislationEnv } from './index';

vi.mock('@ssm-usor/legislation-check', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@ssm-usor/legislation-check')>()),
  runLegislationCheck: vi.fn(),
  runInProgress: vi.fn(),
}));

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
  vi.unstubAllGlobals();
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
