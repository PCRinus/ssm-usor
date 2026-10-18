import {
  type ParticipantInvitationSms,
  participantInvitationSmsSchema,
  type SignatureRequestSms,
  signatureRequestSmsSchema,
  type SignInCodeSms,
  signInCodeSmsSchema,
  type SigningCodeSms,
  signingCodeSmsSchema,
  type SmsReceipt,
  type SmsService,
} from '@ssm-usor/contracts';
import { WorkerEntrypoint } from 'cloudflare:workers';

import type { SmsEnv } from './env';
import {
  participantInvitationText,
  signatureRequestText,
  signInCodeText,
  signingCodeText,
} from './messages';
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

  async sendSigningCode(input: SigningCodeSms): Promise<SmsReceipt> {
    const code = signingCodeSmsSchema.parse(input);

    return createProvider(this.env).send({ to: code.to, body: signingCodeText(code) });
  }

  async sendSignatureRequest(input: SignatureRequestSms): Promise<SmsReceipt> {
    const request = signatureRequestSmsSchema.parse(input);

    return createProvider(this.env).send({ to: request.to, body: signatureRequestText(request) });
  }
}

// The Worker has no routes; this only answers if one is ever attached by mistake.
export default {
  fetch: () => new Response('Not found', { status: 404 }),
};
