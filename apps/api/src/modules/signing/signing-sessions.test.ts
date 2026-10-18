import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createSigningSession,
  type NewSigningSession,
  type SigningCodeMessage,
  signingCodeSender,
  type SigningSession,
  type SigningSessionStore,
  signingSessionStore,
  verifySigningCode,
} from './signing-sessions';

const accountId = '1e8b36cc-d87a-4318-9af2-acb1f6156112';
const now = new Date('2026-10-18T09:30:00.000Z');
const seconds = (count: number) => new Date(now.getTime() + count * 1000);

type Stored = SigningSession & { codeHash: string };

function memoryStore() {
  const sessions = new Map<string, Stored>();
  const store: SigningSessionStore = {
    lastCodeSentAt: async (account) =>
      [...sessions.values()]
        .filter((session) => session.accountId === account)
        .map((session) => session.codeSentAt)
        .sort((a, b) => b.getTime() - a.getTime())[0] ?? null,
    insert: async (session: NewSigningSession) => {
      sessions.set(session.id, { ...session, attempts: 0, verifiedAt: null });
    },
    remove: async (id) => {
      sessions.delete(id);
    },
    load: async (id, account) => {
      const session = sessions.get(id);
      return session && session.accountId === account ? { ...session } : null;
    },
    countAttempt: async (id, before) => {
      const session = sessions.get(id)!;
      if (session.attempts !== before || session.verifiedAt) return false;
      session.attempts += 1;
      return true;
    },
    markVerified: async (id, at) => {
      const session = sessions.get(id)!;
      if (session.verifiedAt) return null;
      session.verifiedAt = at;
      return Object.fromEntries(
        Object.entries(session).filter(([key]) => key !== 'codeHash')
      ) as SigningSession;
    },
  };
  return { store, sessions };
}

let memory: ReturnType<typeof memoryStore>;
let sent: SigningCodeMessage[];
const send = vi.fn(async (message: SigningCodeMessage) => {
  sent.push(message);
});

const start = (overrides: Partial<Parameters<typeof createSigningSession>[1]> = {}, at = now) =>
  createSigningSession(
    { store: memory.store, send },
    {
      accountId,
      channel: 'email',
      address: ' Ion@Example.RO ',
      clientIp: '203.0.113.7',
      userAgent: 'Mozilla/5.0',
      ...overrides,
    },
    at
  );

beforeEach(() => {
  memory = memoryStore();
  sent = [];
  send.mockClear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createSigningSession', () => {
  it('sends a six-digit code valid ten minutes to the normalized address, and keeps only its hash', async () => {
    const { sessionId, expiresAt } = await start();

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ channel: 'email', to: 'ion@example.ro', expiresInMinutes: 10 });
    expect(sent[0]!.code).toMatch(/^\d{6}$/);
    expect(expiresAt.toISOString()).toBe('2026-10-18T09:40:00.000Z');
    const stored = memory.sessions.get(sessionId)!;
    expect(stored).toMatchObject({
      accountId,
      address: 'ion@example.ro',
      clientIp: '203.0.113.7',
      userAgent: 'Mozilla/5.0',
    });
    expect(stored.codeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(stored)).not.toContain(`"${sent[0]!.code}"`);
  });

  it('salts the hash with the session, so the same code hashes differently in two sessions', async () => {
    vi.spyOn(crypto, 'getRandomValues').mockImplementation(((array: Uint32Array) =>
      array.fill(123_456)) as never);

    const first = await start({}, now);
    const second = await start({}, seconds(61));

    expect(sent[0]!.code).toBe(sent[1]!.code);
    expect(memory.sessions.get(first.sessionId)!.codeHash).not.toBe(
      memory.sessions.get(second.sessionId)!.codeHash
    );
  });

  it('runs onCreated before sending, and keeps nothing and sends nothing when it fails', async () => {
    const seen: string[] = [];
    const { sessionId } = await createSigningSession(
      { store: memory.store, send },
      { accountId, channel: 'email', address: 'ion@example.ro', clientIp: null, userAgent: null },
      now,
      async (id) => {
        seen.push(id);
        expect(sent).toHaveLength(0);
      }
    );
    expect(seen).toEqual([sessionId]);

    const failing = createSigningSession(
      { store: memory.store, send },
      { accountId, channel: 'email', address: 'ion@example.ro', clientIp: null, userAgent: null },
      seconds(61),
      async () => {
        throw new Error('items not kept');
      }
    );
    await expect(failing).rejects.toThrow('items not kept');
    expect(sent).toHaveLength(1);
    expect(memory.sessions.size).toBe(1);
  });

  it('refuses a second code for the account within a minute', async () => {
    await start();

    await expect(start({}, seconds(59))).rejects.toMatchObject({
      code: 'conflict',
      reason: 'code_rate_limited',
    });
    await expect(start({}, seconds(60))).resolves.toBeDefined();
  });

  it('texts a phone in E.164 and refuses any other phone', async () => {
    await start({ channel: 'sms', address: '+40722123456' });

    expect(sent[0]).toMatchObject({ channel: 'sms', to: '+40722123456' });
    await expect(
      start({ channel: 'sms', address: '0722 123 456' }, seconds(61))
    ).rejects.toMatchObject({ code: 'validation_error' });
  });

  it('forgets a session whose code could not be sent, so the person may ask again', async () => {
    send.mockRejectedValueOnce(new Error('Resend refused'));

    await expect(start()).rejects.toMatchObject({
      code: 'service_unavailable',
      reason: 'signing_code_not_sent',
    });
    expect(memory.sessions.size).toBe(0);
    await expect(start({}, seconds(1))).resolves.toBeDefined();
  });
});

describe('verifySigningCode', () => {
  const verify = (sessionId: string, code: string, at = seconds(30), account = accountId) =>
    verifySigningCode(memory.store, { sessionId, accountId: account, code }, at);

  it('verifies the code once and returns the session for the evidence', async () => {
    const { sessionId } = await start();

    const session = await verify(sessionId, ` ${sent[0]!.code} `);

    expect(session).toMatchObject({
      id: sessionId,
      accountId,
      channel: 'email',
      address: 'ion@example.ro',
      codeSentAt: now,
      verifiedAt: seconds(30),
      attempts: 1,
    });
    expect(session).not.toHaveProperty('codeHash');
    await expect(verify(sessionId, sent[0]!.code)).rejects.toMatchObject({
      reason: 'code_already_used',
    });
  });

  it('counts wrong codes and refuses after three attempts', async () => {
    const { sessionId } = await start();
    const wrong = sent[0]!.code === '000000' ? '111111' : '000000';

    await expect(verify(sessionId, wrong)).rejects.toMatchObject({
      reason: 'code_invalid',
      message: 'The code is wrong; 2 attempts are left.',
    });
    await expect(verify(sessionId, wrong)).rejects.toMatchObject({
      message: 'The code is wrong; one attempt is left.',
    });
    await expect(verify(sessionId, wrong)).rejects.toMatchObject({ reason: 'code_invalid' });
    await expect(verify(sessionId, sent[0]!.code)).rejects.toMatchObject({
      reason: 'code_attempts_exceeded',
    });
    expect(memory.sessions.get(sessionId)!.attempts).toBe(3);
  });

  it('refuses an expired code without counting it', async () => {
    const { sessionId } = await start();

    await expect(verify(sessionId, sent[0]!.code, seconds(600))).rejects.toMatchObject({
      reason: 'code_expired',
    });
    expect(memory.sessions.get(sessionId)!.attempts).toBe(0);
  });

  it("answers 404 for a session that is not the account's", async () => {
    const { sessionId } = await start();

    await expect(
      verify(sessionId, sent[0]!.code, seconds(30), '00000000-0000-4000-8000-000000000001')
    ).rejects.toMatchObject({ code: 'not_found', reason: 'signing_session_not_found' });
  });

  it('refuses when a concurrent attempt counted first', async () => {
    const { sessionId } = await start();
    vi.spyOn(memory.store, 'countAttempt').mockResolvedValueOnce(false);

    await expect(verify(sessionId, sent[0]!.code)).rejects.toMatchObject({
      reason: 'code_invalid',
    });
    expect(memory.sessions.get(sessionId)!.verifiedAt).toBeNull();
  });
});

describe('the stores', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('counts an attempt only on the row it read, and never on a verified one', async () => {
    fetchMock.mockResolvedValue(Response.json([{ id: 's1' }]));
    const { createClient } = await import('@supabase/supabase-js');
    const store = signingSessionStore(
      createClient('https://example.supabase.co', 'sb_secret_test_key_value') as never
    );

    expect(await store.countAttempt('s1', 2)).toBe(true);

    const url = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(url.pathname).toBe('/rest/v1/signing_sessions');
    expect(url.searchParams.get('id')).toBe('eq.s1');
    expect(url.searchParams.get('attempts')).toBe('eq.2');
    expect(url.searchParams.get('verified_at')).toBe('is.null');
    expect(JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)).toEqual({ attempts: 3 });
  });

  it('sends the code over the binding of its channel', async () => {
    const sendEmail = vi.fn().mockResolvedValue({ id: 'm1' });
    const sendSms = vi.fn().mockResolvedValue({ id: 's1' });
    const sender = signingCodeSender({
      MAIL: { sendSigningCode: sendEmail } as never,
      SMS: { sendSigningCode: sendSms } as never,
    });

    await sender({ channel: 'email', to: 'ion@example.ro', code: '123456', expiresInMinutes: 10 });
    await sender({ channel: 'sms', to: '+40722123456', code: '123456', expiresInMinutes: 10 });

    expect(sendEmail).toHaveBeenCalledWith({
      to: 'ion@example.ro',
      code: '123456',
      expiresInMinutes: 10,
    });
    expect(sendSms).toHaveBeenCalledWith({
      to: '+40722123456',
      code: '123456',
      expiresInMinutes: 10,
    });
  });
});
