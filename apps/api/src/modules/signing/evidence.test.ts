import { describe, expect, it } from 'vitest';

import { sessionEvidence } from './evidence';
import type { SigningSession } from './signing-sessions';

const session: SigningSession = {
  id: '5e5e5e5e-0000-4000-8000-000000000001',
  accountId: '0f7c8d96-479c-47b3-b49e-01f4555a0221',
  place: 'portal',
  participantId: null,
  channel: 'sms',
  address: '+40712345678',
  codeSentAt: new Date('2026-10-18T09:28:00Z'),
  expiresAt: new Date('2026-10-18T09:38:00Z'),
  attempts: 1,
  verifiedAt: new Date('2026-10-18T09:29:30Z'),
  clientIp: null,
  userAgent: null,
};

const input = {
  session,
  signer: { accountId: session.accountId, name: 'Ion POP' },
  certificateSerial: '0a1b',
  signedAt: new Date('2026-10-18T09:30:00Z'),
  digestBefore: 'aa',
  digestAfter: 'bb',
  clientIp: '203.0.113.7',
  userAgent: 'Firefox',
};

describe('the evidence of a signature made in a session', () => {
  it('records the signer, the code, the moment, both digests and the device', () => {
    expect(sessionEvidence(input)).toEqual({
      signer_account_id: session.accountId,
      signer_name: 'Ion POP',
      channel: 'sms',
      address: '+40712345678',
      code_sent_at: '2026-10-18T09:28:00.000Z',
      code_verified_at: '2026-10-18T09:29:30.000Z',
      signed_at: '2026-10-18T09:30:00.000Z',
      digest_before: 'aa',
      digest_after: 'bb',
      certificate_serial: '0a1b',
      client_ip: '203.0.113.7',
      user_agent: 'Firefox',
      signing_session_id: session.id,
    });
  });

  it('takes the signing moment as the code check when the session has none, and cuts a long user agent', () => {
    const evidence = sessionEvidence({
      ...input,
      session: { ...session, verifiedAt: null },
      userAgent: 'x'.repeat(600),
    });
    expect(evidence.code_verified_at).toBe('2026-10-18T09:30:00.000Z');
    expect(evidence.user_agent).toHaveLength(500);
    expect(sessionEvidence({ ...input, userAgent: null }).user_agent).toBeNull();
  });
});
