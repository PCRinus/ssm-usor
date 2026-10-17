import { z } from 'zod';

// With the "+", which Supabase Auth leaves out of the phone it hands the Send SMS hook.
const recipientSchema = z.string().regex(/^\+[1-9]\d{6,14}$/, 'Expected an E.164 number.');

const codeSchema = z.string().regex(/^\d{6,10}$/);

/** Tells a participant who invited them to the portal and where it is (ADR 022). */
export const participantInvitationSmsSchema = z.object({
  to: recipientSchema,
  clientName: z.string().trim().min(2).max(200),
  organizationName: z.string().trim().min(2).max(200),
  portalUrl: z.url(),
});

export type ParticipantInvitationSms = z.infer<typeof participantInvitationSmsSchema>;

/** The portal's one-time sign-in code, sent through Supabase Auth's Send SMS hook. */
export const signInCodeSmsSchema = z.object({
  to: recipientSchema,
  code: codeSchema,
  expiresInMinutes: z
    .int()
    .min(1)
    .max(24 * 60),
});

export type SignInCodeSms = z.infer<typeof signInCodeSmsSchema>;

/** The code a signer types to sign (ADR 023): the API's own, not Supabase Auth's. */
export const signingCodeSmsSchema = z.object({
  to: recipientSchema,
  code: z.string().regex(/^\d{6}$/),
  expiresInMinutes: z.int().min(1).max(60),
});

export type SigningCodeSms = z.infer<typeof signingCodeSmsSchema>;

/** Tells a signer that trainings wait for their signature (ADR 023): a count, never the list. */
export const signatureRequestSmsSchema = z.object({
  to: recipientSchema,
  count: z.int().min(1).max(10_000),
  signUrl: z.url(),
  place: z.enum(['portal', 'app']),
});

export type SignatureRequestSms = z.infer<typeof signatureRequestSmsSchema>;

/** `id` is the provider's message id, or null when the message was only logged. */
export type SmsReceipt = { id: string | null };

/**
 * The RPC surface of the SMS Worker. `apps/sms` implements it and callers type their service
 * binding with it. Every method rejects when the message could not be handed to the provider.
 */
export interface SmsService {
  sendParticipantInvitation(input: ParticipantInvitationSms): Promise<SmsReceipt>;
  sendSignInCode(input: SignInCodeSms): Promise<SmsReceipt>;
  sendSigningCode(input: SigningCodeSms): Promise<SmsReceipt>;
  sendSignatureRequest(input: SignatureRequestSms): Promise<SmsReceipt>;
}
