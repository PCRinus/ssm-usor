import {
  type MailReceipt,
  type MailService,
  type WaitlistConfirmationEmail,
  waitlistConfirmationEmailSchema,
} from '@ssm-usor/contracts';
import { WorkerEntrypoint } from 'cloudflare:workers';

import WaitlistConfirmation, { subject as waitlistSubject } from './emails/waitlist-confirmation';
import type { MailEnv } from './env';
import { sendEmail } from './send';

export class Mail extends WorkerEntrypoint<MailEnv> implements MailService {
  async sendWaitlistConfirmation(input: WaitlistConfirmationEmail): Promise<MailReceipt> {
    const { to, confirmUrl } = waitlistConfirmationEmailSchema.parse(input);

    return sendEmail(this.env, {
      to,
      subject: waitlistSubject,
      body: <WaitlistConfirmation confirmUrl={confirmUrl} />,
    });
  }
}

// The Worker has no routes; this only answers if one is ever attached by mistake.
export default {
  fetch: () => new Response('Not found', { status: 404 }),
};
