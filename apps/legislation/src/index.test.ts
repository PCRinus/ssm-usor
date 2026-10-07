import { legalActs } from '@ssm-usor/document-engine/citations';
import { type CheckRun, runLegislationCheck } from '@ssm-usor/legislation-check';
import { afterEach, describe, expect, it, vi } from 'vitest';

import worker from './index';

vi.mock('@ssm-usor/legislation-check', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@ssm-usor/legislation-check')>()),
  runLegislationCheck: vi.fn(),
}));

const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_test' };
const controller = { cron: '17 3 * * *', scheduledTime: 0, type: 'scheduled', noRetry: () => {} };
const scheduled = (bindings: Partial<typeof env>) =>
  worker.scheduled(controller as unknown as ScheduledController, bindings);

const run = (status: CheckRun['status']): CheckRun => ({
  id: 'r1',
  status,
  outcomes: [],
  errors: status === 'failed' ? [{ act: null, message: 'Could not save the acts.' }] : [],
});

afterEach(() => vi.mocked(runLegislationCheck).mockReset());

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

  it('refuses to run without the Supabase settings', async () => {
    await expect(scheduled({ SUPABASE_URL: env.SUPABASE_URL })).rejects.toThrow(
      /SUPABASE_SECRET_KEY/
    );
    expect(runLegislationCheck).not.toHaveBeenCalled();
  });
});
