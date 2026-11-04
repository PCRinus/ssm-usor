import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { alertSender, alertText } from './alerts';

const webhook = 'https://discord.example/api/webhooks/1/token';
const message = { severity: 'now' as const, title: 'Stuck', lines: ['Import: client 1'] };

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('alertText', () => {
  it('opens with the severity, the rule and the environment', () => {
    expect(alertText(message, 'production')).toBe('🔴 **Stuck** · production\nImport: client 1');
    expect(alertText({ ...message, severity: 'week' }, 'non-prod')).toMatch(/^🟡 /);
  });

  it('stays within what Discord takes', () => {
    const text = alertText({ ...message, lines: ['x'.repeat(5_000)] }, 'production');
    expect(text).toHaveLength(2_000);
  });

  it('ends with the admin link, without a preview, only when there is an admin origin', () => {
    const linked = { ...message, adminPath: '/imports/1' };
    expect(alertText(linked, 'production', 'https://admin.ssmusor.ro')).toBe(
      '🔴 **Stuck** · production\nImport: client 1\n<https://admin.ssmusor.ro/imports/1>'
    );
    expect(alertText(linked, 'local')).toBe('🔴 **Stuck** · local\nImport: client 1');
    const long = alertText(
      { ...linked, lines: ['x'.repeat(5_000)] },
      'production',
      'https://admin.ssmusor.ro'
    );
    expect(long).toHaveLength(2_000);
    expect(long.endsWith('…\n<https://admin.ssmusor.ro/imports/1>')).toBe(true);
  });
});

describe('alertSender', () => {
  it('skips silently without a webhook', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const sender = alertSender({ DISCORD_ALERTS_WEBHOOK: ' ' }, fetcher);
    expect(sender.enabled).toBe(false);
    expect(await sender.send(message)).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('posts the text to the webhook, mentioning no one, named for its environment', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }));
    const sender = alertSender(
      { DISCORD_ALERTS_WEBHOOK: webhook, ENVIRONMENT: 'non-prod' },
      fetcher
    );
    expect(await sender.send(message)).toBe(true);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe(webhook);
    expect(JSON.parse(String(init?.body))).toEqual({
      content: '🔴 **Stuck** · non-prod\nImport: client 1',
      allowed_mentions: { parse: [] },
    });
  });

  it('links to the admin area named by ADMIN_ORIGIN', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }));
    await alertSender(
      { DISCORD_ALERTS_WEBHOOK: webhook, ADMIN_ORIGIN: 'https://admin.ssmusor.ro/' },
      fetcher
    ).send({ ...message, adminPath: '/imports/1' });
    expect(JSON.parse(String(fetcher.mock.calls[0]![1]?.body)).content).toMatch(
      /\n<https:\/\/admin\.ssmusor\.ro\/imports\/1>$/
    );
  });

  it('names a Worker without an environment local', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }));
    await alertSender({ DISCORD_ALERTS_WEBHOOK: webhook }, fetcher).send(message);
    expect(JSON.parse(String(fetcher.mock.calls[0]![1]?.body)).content).toContain('· local');
  });

  it('never throws: a refused or failed post is logged and dropped', async () => {
    const refused = alertSender(
      { DISCORD_ALERTS_WEBHOOK: webhook },
      async () => new Response('rate limited', { status: 429 })
    );
    const down = alertSender({ DISCORD_ALERTS_WEBHOOK: webhook }, async () => {
      throw new TypeError('fetch failed');
    });
    expect(await refused.send(message)).toBe(false);
    expect(await down.send(message)).toBe(false);
    expect(console.error).toHaveBeenCalledTimes(2);
  });
});
