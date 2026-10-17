import {
  type ParticipantInvitationSms,
  participantInvitationSmsSchema,
  type SignInCodeSms,
  signInCodeSmsSchema,
  type SmsReceipt,
  type SmsService,
} from '@ssm-usor/contracts';
import { WorkerEntrypoint } from 'cloudflare:workers';

import type { SmsEnv } from './env';
import { participantInvitationText, signInCodeText } from './messages';
import { createProvider } from './provider';

export class Sms extends WorkerEntrypoint<SmsEnv> implements SmsService {
  async sendParticipantInvitation(input: ParticipantInvitationSms): Promise<SmsReceipt> {
    const invitation = participantInvitationSmsSchema.parse(input);

    return createProvider(this.env).send({
      to: invitation.to,
      body: participantInvitationText(invitation),
    });
  }

  async sendSignInCode(input: SignInCodeSms): Promise<SmsReceipt> {
    const code = signInCodeSmsSchema.parse(input);

    return createProvider(this.env).send({ to: code.to, body: signInCodeText(code) });
  }
}

// The Worker has no routes; this only answers if one is ever attached by mistake.
export default {
  fetch: () => new Response('Not found', { status: 404 }),
};
