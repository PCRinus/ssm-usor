import { type ParticipantChannel, signatureErrorReasons } from '@ssm-usor/contracts';
import type { Context } from 'hono';

import { type AdminClient, adminClient } from '../../lib/admin-db';
import type { ApiEnv } from '../../lib/env';
import { ApiError } from '../../lib/errors';

// The API's own code, not Supabase's one-time passcode (ADR 023).
export const SIGNING_CODE_MINUTES = 10;
export const SIGNING_CODE_INTERVAL_SECONDS = 60;
export const SIGNING_CODE_ATTEMPTS = 3;

export type SigningSession = {
  id: string;
  accountId: string;
  /** Where the code was asked for: the app for a member, the portal for a participation. */
  place: 'app' | 'portal';
  participantId: string | null;
  channel: ParticipantChannel;
  address: string;
  codeSentAt: Date;
  expiresAt: Date;
  attempts: number;
  verifiedAt: Date | null;
  clientIp: string | null;
  userAgent: string | null;
};

export type NewSigningSession = Omit<SigningSession, 'attempts' | 'verifiedAt'> & {
  codeHash: string;
};

export type InsertedSession =
  | { inserted: true; codeSentAt: Date; expiresAt: Date }
  | { inserted: false; retryAfterSeconds: number };

export interface SigningSessionStore {
  /**
   * Inserts the session unless the account had a code sent in the last `intervalSeconds`, which
   * the store decides atomically; the moments it answers are the ones it recorded.
   */
  insert(session: NewSigningSession, intervalSeconds: number): Promise<InsertedSession>;
  remove(sessionId: string): Promise<void>;
  load(
    sessionId: string,
    accountId: string
  ): Promise<(SigningSession & { codeHash: string }) | null>;
  /** False when another attempt counted first. */
  countAttempt(sessionId: string, attemptsBefore: number): Promise<boolean>;
  /** Null when the session was verified already. */
  markVerified(sessionId: string, at: Date): Promise<SigningSession | null>;
}

export type SigningCodeMessage = {
  channel: ParticipantChannel;
  to: string;
  code: string;
  expiresInMinutes: number;
};

export type SigningCodeSender = (message: SigningCodeMessage) => Promise<unknown>;

const refused = (reason: string, message: string) =>
  new ApiError('conflict', message, undefined, reason);

const notSent = () =>
  new ApiError(
    'service_unavailable',
    'The signing code could not be sent. Nothing was signed; ask for a new code.',
    undefined,
    signatureErrorReasons.signingCodeNotSent
  );

function signingCode() {
  // Rejection sampling keeps the six digits uniform.
  const limit = Math.floor(0x1_0000_0000 / 1_000_000) * 1_000_000;
  for (;;) {
    const [value] = crypto.getRandomValues(new Uint32Array(1));
    if (value! < limit) return String(value! % 1_000_000).padStart(6, '0');
  }
}

// The session id salts the hash, so a code's hash says nothing about the same code elsewhere.
async function codeHash(sessionId: string, code: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${sessionId}:${code}`)
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function sameText(a: string, b: string) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return difference === 0;
}

function normalizedAddress(channel: ParticipantChannel, address: string) {
  const trimmed = address.trim();
  if (channel === 'email') return trimmed.toLowerCase();
  if (!/^\+[1-9]\d{7,14}$/.test(trimmed)) {
    throw new ApiError('validation_error', 'A code is texted to a phone number in E.164 only.');
  }
  return trimmed;
}

export async function createSigningSession(
  deps: { store: SigningSessionStore; send: SigningCodeSender },
  input: {
    accountId: string;
    place: 'app' | 'portal';
    participantId: string | null;
    channel: ParticipantChannel;
    address: string;
    clientIp: string | null;
    userAgent: string | null;
  },
  now = new Date(),
  // Runs before the code is sent, so that a code never goes out for a session without its items.
  onCreated?: (sessionId: string) => Promise<void>
) {
  const id = crypto.randomUUID();
  const code = signingCode();
  const address = normalizedAddress(input.channel, input.address);
  const session = {
    id,
    accountId: input.accountId,
    place: input.place,
    participantId: input.participantId,
    channel: input.channel,
    address,
    codeSentAt: now,
    expiresAt: new Date(now.getTime() + SIGNING_CODE_MINUTES * 60_000),
    clientIp: input.clientIp,
    userAgent: input.userAgent?.slice(0, 500) ?? null,
  };
  const inserted = await deps.store.insert(
    { ...session, codeHash: await codeHash(id, code) },
    SIGNING_CODE_INTERVAL_SECONDS
  );
  if (!inserted.inserted) {
    throw new ApiError(
      'conflict',
      'A signing code was sent in the last minute; wait before asking for another.',
      undefined,
      signatureErrorReasons.codeRateLimited,
      undefined,
      { retryAfterSeconds: inserted.retryAfterSeconds }
    );
  }
  if (onCreated) {
    try {
      await onCreated(id);
    } catch (error) {
      await deps.store.remove(id).catch(() => undefined);
      throw error;
    }
  }
  try {
    await deps.send({
      channel: input.channel,
      to: address,
      code,
      expiresInMinutes: SIGNING_CODE_MINUTES,
    });
  } catch (error) {
    console.error(
      `Signing code ${input.channel} failed: ${error instanceof Error ? error.name : 'unknown'}`
    );
    // A code that never left must not hold the person back for the minute.
    await deps.store.remove(id).catch(() => undefined);
    throw notSent();
  }
  return { sessionId: id, expiresAt: inserted.expiresAt };
}

export async function verifySigningCode(
  store: SigningSessionStore,
  input: {
    sessionId: string;
    accountId: string;
    code: string;
    place: 'app' | 'portal';
    participantId: string | null;
  },
  now = new Date()
): Promise<SigningSession> {
  const session = await store.load(input.sessionId, input.accountId);
  // A code asked for in one place is typed in the same place, for the same participation.
  if (!session || session.place !== input.place || session.participantId !== input.participantId) {
    throw new ApiError(
      'not_found',
      'This signing session does not exist.',
      undefined,
      signatureErrorReasons.signingSessionNotFound
    );
  }
  if (session.verifiedAt) {
    throw refused(signatureErrorReasons.codeAlreadyUsed, 'This code was used already.');
  }
  if (session.attempts >= SIGNING_CODE_ATTEMPTS) {
    throw refused(
      signatureErrorReasons.codeAttemptsExceeded,
      'The code was typed wrong three times; ask for a new one.'
    );
  }
  if (session.expiresAt.getTime() <= now.getTime()) {
    throw refused(signatureErrorReasons.codeExpired, 'The code has expired; ask for a new one.');
  }
  if (!(await store.countAttempt(session.id, session.attempts))) {
    throw refused(signatureErrorReasons.codeInvalid, 'The code was not checked; type it again.');
  }
  if (!sameText(await codeHash(session.id, input.code.trim()), session.codeHash)) {
    const left = SIGNING_CODE_ATTEMPTS - session.attempts - 1;
    throw new ApiError(
      'conflict',
      left > 0
        ? `The code is wrong; ${left === 1 ? 'one attempt is' : `${left} attempts are`} left.`
        : 'The code is wrong, and no attempt is left; ask for a new one.',
      undefined,
      signatureErrorReasons.codeInvalid,
      undefined,
      { attemptsLeft: left }
    );
  }
  const verified = await store.markVerified(session.id, now);
  if (!verified) {
    throw refused(signatureErrorReasons.codeAlreadyUsed, 'This code was used already.');
  }
  return verified;
}

const sessionColumns =
  'id, account_id, place, participant_id, channel, address, code_hash, code_sent_at, expires_at, attempts, verified_at, client_ip, user_agent';

type SessionRow = {
  id: string;
  account_id: string;
  place: string;
  participant_id: string | null;
  channel: string;
  address: string;
  code_hash: string;
  code_sent_at: string;
  expires_at: string;
  attempts: number;
  verified_at: string | null;
  client_ip: unknown;
  user_agent: string | null;
};

const toSession = (row: SessionRow): SigningSession => ({
  id: row.id,
  accountId: row.account_id,
  place: row.place === 'portal' ? 'portal' : 'app',
  participantId: row.participant_id,
  channel: row.channel as ParticipantChannel,
  address: row.address,
  codeSentAt: new Date(row.code_sent_at),
  expiresAt: new Date(row.expires_at),
  attempts: row.attempts,
  verifiedAt: row.verified_at ? new Date(row.verified_at) : null,
  clientIp: typeof row.client_ip === 'string' ? row.client_ip : null,
  userAgent: row.user_agent,
});

const storeFailed = (context: string, code: string | undefined) => {
  console.error(`Signing session ${context} failed: ${code ?? 'no code'}`);
  return new ApiError('service_unavailable');
};

// signing_sessions has no policy at all: only the secret key reads or writes it.
export function signingSessionStore(admin: AdminClient): SigningSessionStore {
  return {
    async insert(session, intervalSeconds) {
      const { data, error } = await admin
        .rpc('create_signing_session', {
          p_id: session.id,
          p_account_id: session.accountId,
          p_place: session.place,
          p_participant_id: session.participantId ?? undefined,
          p_channel: session.channel,
          p_address: session.address,
          p_code_hash: session.codeHash,
          p_valid_minutes: SIGNING_CODE_MINUTES,
          p_interval_seconds: intervalSeconds,
          p_client_ip: (session.clientIp ?? undefined) as unknown as string,
          p_user_agent: session.userAgent ?? undefined,
        })
        .single();
      if (error) throw storeFailed('insert', error.code);
      if (data.retry_after_seconds > 0) {
        return { inserted: false, retryAfterSeconds: data.retry_after_seconds };
      }
      return {
        inserted: true,
        codeSentAt: new Date(data.code_sent_at!),
        expiresAt: new Date(data.expires_at!),
      };
    },
    async remove(sessionId) {
      const { error } = await admin.from('signing_sessions').delete().eq('id', sessionId);
      if (error) throw storeFailed('remove', error.code);
    },
    async load(sessionId, accountId) {
      const { data, error } = await admin
        .from('signing_sessions')
        .select(sessionColumns)
        .eq('id', sessionId)
        .eq('account_id', accountId)
        .maybeSingle();
      if (error) throw storeFailed('load', error.code);
      return data ? { ...toSession(data), codeHash: data.code_hash } : null;
    },
    async countAttempt(sessionId, attemptsBefore) {
      const { data, error } = await admin
        .from('signing_sessions')
        .update({ attempts: attemptsBefore + 1 })
        .eq('id', sessionId)
        .eq('attempts', attemptsBefore)
        .is('verified_at', null)
        .select('id');
      if (error) throw storeFailed('attempt', error.code);
      return data.length === 1;
    },
    async markVerified(sessionId, at) {
      const { data, error } = await admin
        .from('signing_sessions')
        .update({ verified_at: at.toISOString() })
        .eq('id', sessionId)
        .is('verified_at', null)
        .select(sessionColumns)
        .maybeSingle();
      if (error) throw storeFailed('verify', error.code);
      if (!data) return null;
      return toSession(data);
    },
  };
}

export function signingCodeSender(env: ApiEnv['Bindings']): SigningCodeSender {
  return async ({ channel, ...message }) => {
    if (channel === 'email') {
      if (!env.MAIL) throw new Error('No MAIL binding');
      return env.MAIL.sendSigningCode(message);
    }
    if (!env.SMS) throw new Error('No SMS binding');
    return env.SMS.sendSigningCode(message);
  };
}

export function signingSessionsOf(c: Context<ApiEnv>) {
  const store = signingSessionStore(adminClient(c.env));
  return {
    create: (
      input: Parameters<typeof createSigningSession>[1],
      onCreated?: (sessionId: string) => Promise<void>
    ) =>
      createSigningSession({ store, send: signingCodeSender(c.env) }, input, new Date(), onCreated),
    verify: (input: Parameters<typeof verifySigningCode>[1]) => verifySigningCode(store, input),
  };
}
