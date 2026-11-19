import type { MailService } from '@ssm-usor/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { adminClient } from '../../lib/admin-db';
import { env as billingEnv } from './upstream.fixture';
import {
  type NoticeDeps,
  noticeDepsFor,
  type NoticeRecipient,
  sendNoticeOnce,
} from './usage-notices';

const organizationId = 'org-1';
const periodStart = '2026-11-13T08:00:00.000Z';
const owner: NoticeRecipient = { to: 'olga@exemplu.example', organizationName: 'Prevenire' };

function setUp(options: { recipient?: NoticeRecipient | null; mail?: boolean } = {}) {
  const recorded = new Set<string>();
  const deps = {
    store: {
      recordNotice: vi.fn(async (_: string, start: string, kind: string) => {
        if (recorded.has(start + kind)) return false;
        recorded.add(start + kind);
        return true;
      }),
      forgetNotice: vi.fn(async (_: string, start: string, kind: string) => {
        recorded.delete(start + kind);
      }),
    },
    recipient: vi.fn(async () => (options.recipient === undefined ? owner : options.recipient)),
    mail: options.mail === false ? undefined : ({} as MailService),
  } satisfies NoticeDeps;
  const send = vi.fn<(mail: MailService, recipient: NoticeRecipient) => Promise<unknown>>(
    async () => ({ id: 'm' })
  );
  const once = (
    whenNoRecipient: 'keep' | 'forget' = 'keep',
    onFailure?: (error: unknown) => void
  ) =>
    sendNoticeOnce(
      deps,
      { organizationId, periodStart, kind: 'sms_80', whenNoRecipient, onFailure },
      send
    );
  return { deps, send, once, recorded };
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('a notice sent once', () => {
  it('records it before sending, and sends it to the owner only the first time', async () => {
    const { deps, send, once } = setUp();

    expect(await once()).toBe('sent');
    expect(await once()).toBe('duplicate');

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(deps.mail, owner);
    expect(deps.store.recordNotice.mock.invocationCallOrder[0]).toBeLessThan(
      send.mock.invocationCallOrder[0]!
    );
  });

  it('keeps the record without an owner when asked to keep it', async () => {
    const { send, once, recorded } = setUp({ recipient: null });

    expect(await once('keep')).toBe('unaddressed');
    expect(send).not.toHaveBeenCalled();
    expect(recorded.size).toBe(1);
  });

  it('takes the record back without an owner when asked to forget it, and throws', async () => {
    const { send, once, recorded } = setUp({ recipient: null });

    await expect(once('forget')).rejects.toThrow('no owner to tell');
    expect(send).not.toHaveBeenCalled();
    expect(recorded.size).toBe(0);
  });

  it('takes the record back when the email fails, so the next attempt sends it', async () => {
    const { send, once } = setUp();
    send.mockRejectedValueOnce(new Error('provider down'));

    await expect(once()).rejects.toThrow('provider down');
    expect(await once()).toBe('sent');
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('takes the record back without a mail binding', async () => {
    const { once, recorded } = setUp({ mail: false });

    await expect(once()).rejects.toThrow('No MAIL binding');
    expect(recorded.size).toBe(0);
  });

  it('hands a failed send to onFailure instead of throwing', async () => {
    const { send, once, recorded } = setUp();
    const failure = new Error('provider down');
    send.mockRejectedValueOnce(failure);
    const onFailure = vi.fn();

    expect(await once('keep', onFailure)).toBe('failed');
    expect(onFailure).toHaveBeenCalledWith(failure);
    expect(recorded.size).toBe(0);
  });

  it('still throws a failure to record, with onFailure', async () => {
    const { deps, send, once } = setUp();
    deps.store.recordNotice.mockRejectedValueOnce(new Error('database down'));
    const onFailure = vi.fn();

    await expect(once('keep', onFailure)).rejects.toThrow('database down');
    expect(onFailure).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('throws the send failure even when taking the record back fails', async () => {
    const { deps, send, once } = setUp();
    send.mockRejectedValueOnce(new Error('provider down'));
    deps.store.forgetNotice.mockRejectedValueOnce(new Error('database down'));

    await expect(once()).rejects.toThrow('provider down');
    expect(console.error).toHaveBeenCalledWith('Notice sms_80 for org-1 stays recorded, unsent.');
  });
});

describe("a Worker's notice dependencies", () => {
  it('mail through its binding and link to the subscription page of its app', () => {
    const mail = {} as MailService;
    const env = { ...billingEnv, MAIL: mail };
    const deps = noticeDepsFor(env, adminClient(env));
    expect(deps.mail).toBe(mail);
    expect(deps.subscriptionUrl()).toBe('https://app.example.ro/organizatie/abonament');
  });
});
