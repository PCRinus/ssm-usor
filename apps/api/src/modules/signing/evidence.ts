import type { SigningSession } from './signing-sessions';

export function sessionEvidence({
  session,
  signer,
  certificateSerial,
  signedAt,
  digestBefore,
  digestAfter,
  clientIp,
  userAgent,
}: {
  session: SigningSession;
  signer: { accountId: string; name: string };
  certificateSerial: string;
  signedAt: Date;
  digestBefore: string;
  digestAfter: string;
  clientIp: string | null;
  userAgent: string | null;
}) {
  return {
    signer_account_id: signer.accountId,
    signer_name: signer.name,
    channel: session.channel,
    address: session.address,
    code_sent_at: session.codeSentAt.toISOString(),
    code_verified_at: (session.verifiedAt ?? signedAt).toISOString(),
    signed_at: signedAt.toISOString(),
    digest_before: digestBefore,
    digest_after: digestAfter,
    certificate_serial: certificateSerial,
    client_ip: clientIp,
    user_agent: userAgent?.slice(0, 500) ?? null,
    signing_session_id: session.id,
  };
}
