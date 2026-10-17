import { type ApiEnv, appOrigin, portalOrigin } from '../../lib/env';
import type { SignerContact, SigningPlace } from './signers';

/** One message per signer and save: how many trainings wait for them, never which. */
export async function notifySigner(
  env: ApiEnv['Bindings'],
  signer: { contact: SignerContact; place: SigningPlace },
  { count, organizationName }: { count: number; organizationName: string }
) {
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
    return;
  }
  if (!env.SMS) throw new Error('No SMS binding');
  await env.SMS.sendSignatureRequest({ to: address, count, signUrl, place: signer.place });
}
