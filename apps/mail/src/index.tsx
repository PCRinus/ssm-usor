import {
  type MailReceipt,
  type MailService,
  type OrganizationInvitationEmail,
  organizationInvitationEmailSchema,
  type ParticipantInvitationEmail,
  participantInvitationEmailSchema,
  type PasswordChangedEmail,
  passwordChangedEmailSchema,
  type PasswordResetEmail,
  passwordResetEmailSchema,
  type ServiceContractEmail,
  serviceContractEmailSchema,
  type SignedCopyReceivedEmail,
  signedCopyReceivedEmailSchema,
  type SignInCodeEmail,
  signInCodeEmailSchema,
  type SignupConfirmationEmail,
  signupConfirmationEmailSchema,
  type WaitlistConfirmationEmail,
  waitlistConfirmationEmailSchema,
} from '@ssm-usor/contracts';
import { WorkerEntrypoint } from 'cloudflare:workers';

import OrganizationInvitation, {
  subject as invitationSubject,
} from './emails/organization-invitation';
import ParticipantInvitation, {
  subject as participantInvitationSubject,
} from './emails/participant-invitation';
import PasswordChanged, { subject as passwordChangedSubject } from './emails/password-changed';
import PasswordReset, { subject as passwordResetSubject } from './emails/password-reset';
import ServiceContract, { subject as serviceContractSubject } from './emails/service-contract';
import SignInCode, { subject as signInCodeSubject } from './emails/sign-in-code';
import SignedCopyReceived, {
  subject as signedCopyReceivedSubject,
} from './emails/signed-copy-received';
import SignupConfirmation, {
  subject as signupConfirmationSubject,
} from './emails/signup-confirmation';
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

  async sendPasswordReset(input: PasswordResetEmail): Promise<MailReceipt> {
    const { to, ...reset } = passwordResetEmailSchema.parse(input);

    return sendEmail(this.env, {
      to,
      subject: passwordResetSubject,
      body: <PasswordReset {...reset} />,
    });
  }

  async sendPasswordChanged(input: PasswordChangedEmail): Promise<MailReceipt> {
    const { to, ...notice } = passwordChangedEmailSchema.parse(input);

    return sendEmail(this.env, {
      to,
      subject: passwordChangedSubject,
      body: <PasswordChanged {...notice} />,
    });
  }

  async sendSignupConfirmation(input: SignupConfirmationEmail): Promise<MailReceipt> {
    const { to, ...confirmation } = signupConfirmationEmailSchema.parse(input);

    return sendEmail(this.env, {
      to,
      subject: signupConfirmationSubject,
      body: <SignupConfirmation {...confirmation} />,
    });
  }

  async sendServiceContract(input: ServiceContractEmail): Promise<MailReceipt> {
    const { to, attachment, ...contract } = serviceContractEmailSchema.parse(input);

    return sendEmail(this.env, {
      to,
      subject: serviceContractSubject(contract.organizationName),
      body: <ServiceContract {...contract} />,
      sender: { name: contract.senderName, email: contract.senderEmail },
      from: this.env.MAIL_FROM_CONTRACTS,
      attachments: [attachment],
    });
  }

  async sendSignedCopyReceived(input: SignedCopyReceivedEmail): Promise<MailReceipt> {
    const { to, ...received } = signedCopyReceivedEmailSchema.parse(input);

    return sendEmail(this.env, {
      to,
      subject: signedCopyReceivedSubject(received.clientName),
      body: <SignedCopyReceived {...received} />,
    });
  }

  async sendParticipantInvitation(input: ParticipantInvitationEmail): Promise<MailReceipt> {
    const { to, ...invitation } = participantInvitationEmailSchema.parse(input);

    return sendEmail(this.env, {
      to,
      subject: participantInvitationSubject(invitation.clientName),
      body: <ParticipantInvitation {...invitation} />,
    });
  }

  async sendSignInCode(input: SignInCodeEmail): Promise<MailReceipt> {
    const { to, ...code } = signInCodeEmailSchema.parse(input);

    return sendEmail(this.env, {
      to,
      subject: signInCodeSubject(code.code),
      body: <SignInCode {...code} />,
    });
  }
}

// The Worker has no routes; this only answers if one is ever attached by mistake.
export default {
  fetch: () => new Response('Not found', { status: 404 }),
};
