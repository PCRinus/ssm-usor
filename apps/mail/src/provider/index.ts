import type { MailReceipt } from '@ssm-usor/contracts';

import type { MailEnv } from '../env';
import { logProvider } from './log';
import { resendProvider } from './resend';

export type OutgoingEmail = {
  from: string;
  replyTo?: string;
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type MailProvider = { send(email: OutgoingEmail): Promise<MailReceipt> };

/** The one place that knows which service delivers email. */
export function createProvider(env: MailEnv): MailProvider {
  return env.RESEND_API_KEY ? resendProvider(env.RESEND_API_KEY) : logProvider();
}
