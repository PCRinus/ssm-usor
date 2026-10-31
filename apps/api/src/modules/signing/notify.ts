import type { SmsRefusalReason } from '@ssm-usor/contracts';

import { type ApiEnv, appOrigin, portalOrigin } from '../../lib/env';
import type { SmsSender } from '../sms-usage/sender';
import type { SignerContact, SigningPlace } from './signers';

/**
 * One message per signer and save: how many trainings wait for them, never which. A refused SMS
 * is skipped and the request stands; a signer with an email is never texted (signers.ts).
 */
export async function notifySigner(
  deps: { env: ApiEnv['Bindings']; sms: Pick<SmsSender, 'send'> },
  signer: { contact: SignerContact; place: SigningPlace },
  {
    count,
    organizationId,
    organizationName,
  }: { count: number; organizationId: string; organizationName: string }
): Promise<{ sent: true } | { sent: false; reason: SmsRefusalReason }> {
  const { env } = deps;
  const signUrl = signer.place === 'portal' ? portalOrigin(env) : appOrigin(env);
  const { channel, address } = signer.contact;
  if (channel === 'email') {
    if (!env.MAIL) throw new Error('No MAIL binding');
    await env.MAIL.sendSignatureRequest({
      to: address,
      count,
      organizationName,
      signUrl,
      place: signer.place,
    });
    return { sent: true };
  }
  const outcome = await deps.sms.send({
    organizationId,
    kind: 'signature_request',
    to: address,
    deliver: (sms) =>
      sms.sendSignatureRequest({ to: address, count, signUrl, place: signer.place }),
  });
  return outcome.sent ? { sent: true } : { sent: false, reason: outcome.reason };
}
