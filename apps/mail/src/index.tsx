import {
  type MailReceipt,
  type MailService,
  type OrganizationInvitationEmail,
  organizationInvitationEmailSchema,
  type WaitlistConfirmationEmail,
  waitlistConfirmationEmailSchema,
} from '@ssm-usor/contracts';
import { WorkerEntrypoint } from 'cloudflare:workers';

import OrganizationInvitation, {
  subject as invitationSubject,
} from './emails/organization-invitation';
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

  async sendOrganizationInvitation(input: OrganizationInvitationEmail): Promise<MailReceipt> {
    const { to, ...invitation } = organizationInvitationEmailSchema.parse(input);

    return sendEmail(this.env, {
      to,
      subject: invitationSubject(invitation.organizationName),
      body: <OrganizationInvitation {...invitation} />,
    });
  }
}

// The Worker has no routes; this only answers if one is ever attached by mistake.
export default {
  fetch: () => new Response('Not found', { status: 404 }),
};
