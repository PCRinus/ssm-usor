import { legalActs } from '@ssm-usor/document-engine/citations';
import { type CheckRun, fetchPortalAct, runLegislationCheck } from '@ssm-usor/legislation-check';
import { afterEach, describe, expect, it, vi } from 'vitest';

import worker, { type LegislationEnv } from './index';

vi.mock('@ssm-usor/legislation-check', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@ssm-usor/legislation-check')>()),
  runLegislationCheck: vi.fn(),
}));

const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_test' };
const controller = { cron: '17 3 * * *', scheduledTime: 0, type: 'scheduled', noRetry: () => {} };
const scheduled = (bindings: LegislationEnv) =>
  worker.scheduled(controller as unknown as ScheduledController, bindings);

const run = (status: CheckRun['status']): CheckRun => ({
  id: 'r1',
  status,
  outcomes: [],
  errors: status === 'failed' ? [{ act: null, message: 'Could not save the acts.' }] : [],
});

afterEach(() => {
  vi.mocked(runLegislationCheck).mockReset();
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

  it('refuses to run without the Supabase settings', async () => {
    await expect(scheduled({ SUPABASE_URL: env.SUPABASE_URL })).rejects.toThrow(
      /SUPABASE_SECRET_KEY/
    );
    expect(runLegislationCheck).not.toHaveBeenCalled();
  });
});
