import type { MailService } from '@ssm-usor/contracts';
import type { Context } from 'hono';
import { z } from 'zod';

import { appOrigin } from '../../lib/env';
import { isParticipantAccount } from '../../lib/participant-account';
import { createRouter } from '../../router';
import { verifyWebhookSignature } from './signature';

// Supabase Auth calls these instead of sending its own email (ADR 002) and SMS (ADR 022). They
// are not part of the OpenAPI document: the only caller is Supabase, and the SPA client has no
// use for them.

// How long an emailed link or code works: `otp_expiry` in supabase/config.toml, in minutes.
const OTP_EXPIRY_MINUTES = 60;

// How long a texted code works: `sms_otp_exp`, which config.toml cannot declare. The deployment
// workflow sets it on the hosted project; the local stack fixes it at 100 minutes.
const SMS_OTP_EXPIRY_MINUTES = 10;

const codeSchema = z.string().regex(/^\d{6,10}$/);
const appMetadataSchema = z.record(z.string(), z.unknown()).nullish();

const sendEmailPayloadSchema = z.object({
  user: z.object({ email: z.email(), app_metadata: appMetadataSchema }),
  email_data: z.object({
    token: z.string().optional(),
    // Empty for a notification, which asks nothing of the person and carries no link of
    // Supabase's.
    token_hash: z.string().optional(),
    email_action_type: z.string().min(1),
  }),
});

const sendSmsPayloadSchema = z.object({
  user: z.object({ phone: z.string().optional(), app_metadata: appMetadataSchema }),
  // `phone` is where the code goes; `user.phone` differs from it only during a phone change.
  sms: z.object({ otp: codeSchema, phone: z.string().optional() }),
});

// The emails in use that carry a link, by Supabase's `email_action_type`.
const emails: Record<
  string,
  { path: string; send: (mail: MailService, to: string, url: string) => Promise<unknown> }
> = {
  recovery: {
    path: '/reset-password',
    send: (mail, to, resetUrl) =>
      mail.sendPasswordReset({ to, resetUrl, expiresInMinutes: OTP_EXPIRY_MINUTES }),
  },
  signup: {
    path: '/confirm-email',
    send: (mail, to, confirmUrl) =>
      mail.sendSignupConfirmation({ to, confirmUrl, expiresInMinutes: OTP_EXPIRY_MINUTES }),
  },
};

// Notices that something happened, enabled in supabase/config.toml under
// [auth.email.notification]. They carry no token: the only link is to a public page of the SPA.
const notifications: Record<
  string,
  { path: string; send: (mail: MailService, to: string, url: string) => Promise<unknown> }
> = {
  password_changed_notification: {
    path: '/forgot-password',
    send: (mail, to, forgotPasswordUrl) => mail.sendPasswordChanged({ to, forgotPasswordUrl }),
  },
};

// The shape Supabase Auth expects from a failing hook.
const hookError = (status: 400 | 401 | 403 | 422 | 500 | 503, message: string) =>
  Response.json({ error: { http_code: status, message } }, { status });

async function readSignedPayload(
  c: Context,
  secret: string
): Promise<{ json: unknown } | { failure: Response }> {
  // The signature covers the exact bytes, so the body is read as text before parsing.
  const body = await c.req.text();
  const verified = await verifyWebhookSignature(secret, {
    id: c.req.header('webhook-id'),
    timestamp: c.req.header('webhook-timestamp'),
    signature: c.req.header('webhook-signature'),
    body,
  });
  if (!verified) return { failure: hookError(401, 'Invalid signature.') };

  try {
    return { json: JSON.parse(body) };
  } catch {
    return { failure: hookError(400, 'The payload is not JSON.') };
  }
}

async function handOver(kind: 'email' | 'SMS', send: () => Promise<unknown>) {
  try {
    await send();
  } catch (error) {
    console.error(`Auth ${kind} failed: ${error instanceof Error ? error.name : 'unknown'}`);
    return hookError(500, `The ${kind} could not be sent.`);
  }
  return Response.json({}, { status: 200 });
}

export const authHooksRouter = createRouter()
  .post('/hooks/supabase/send-email', async (c) => {
    const secret = c.env.SUPABASE_AUTH_HOOK_SECRET;
    const mail = c.env.MAIL;
    if (!secret || !mail) return hookError(503, 'The email hook is not configured.');

    const signed = await readSignedPayload(c, secret);
    if ('failure' in signed) return signed.failure;
    const payload = sendEmailPayloadSchema.safeParse(signed.json);
    if (!payload.success) return hookError(400, 'The payload is not a Send Email hook payload.');
    const { user, email_data: emailData } = payload.data;
    const type = emailData.email_action_type;

    // The portal's code (ADR 022), asked for with `signInWithOtp`. While an address is
    // unconfirmed Supabase sends its signup confirmation instead of the code, and a
    // participant's account is created unconfirmed, so their first code arrives as `signup`.
    if (type === 'magiclink' || (type === 'signup' && isParticipantAccount(user.app_metadata))) {
      const code = codeSchema.safeParse(emailData.token);
      if (!code.success) return hookError(400, 'The payload has no code.');
      return handOver('email', () =>
        mail.sendSignInCode({
          to: user.email,
          code: code.data,
          expiresInMinutes: OTP_EXPIRY_MINUTES,
        })
      );
    }

    // Once enabled, the hook receives every email Supabase Auth would send. The types not in
    // use fail loudly here instead of silently never arriving.
    const notification = notifications[type];
    const email = notification ?? emails[type];
    if (!email) {
      console.error(`Unsupported auth email type: ${type}`);
      return hookError(422, `Unsupported email type: ${type}.`);
    }

    // Each link opens a page of the SPA that verifies the token only when its form or button
    // is submitted, so a mail scanner following the link cannot use it up. The redirect
    // Supabase was asked for is ignored, so the link cannot leave the SPA.
    const url = new URL(email.path, appOrigin(c.env));
    if (!notification) {
      if (!emailData.token_hash) return hookError(400, 'The payload has no token hash.');
      url.searchParams.set('token_hash', emailData.token_hash);
    }

    return handOver('email', () => email.send(mail, user.email, url.href));
  })
  .post('/hooks/supabase/send-sms', async (c) => {
    const secret = c.env.SUPABASE_AUTH_SMS_HOOK_SECRET;
    const sms = c.env.SMS;
    if (!secret || !sms) return hookError(503, 'The SMS hook is not configured.');

    const signed = await readSignedPayload(c, secret);
    if ('failure' in signed) return signed.failure;
    const payload = sendSmsPayloadSchema.safeParse(signed.json);
    if (!payload.success) return hookError(400, 'The payload is not a Send SMS hook payload.');
    const { user, sms: message } = payload.data;

    // Supabase keeps a phone in E.164 without the "+".
    const to = `+${(message.phone || user.phone || '').replace(/^\+/, '')}`;
    if (!/^\+[1-9]\d{6,14}$/.test(to)) return hookError(400, 'The payload has no phone number.');

    // Phone sign-in cannot be on with phone signup off in Supabase, so anyone can have it make
    // an account for any number and text it a code. Only an account the API made for an
    // invitation is texted: a stranger's number costs nothing.
    if (!isParticipantAccount(user.app_metadata)) {
      console.error('Refused a code SMS to an account no invitation created.');
      return hookError(403, 'This number cannot receive a code.');
    }

    return handOver('SMS', () =>
      sms.sendSignInCode({ to, code: message.otp, expiresInMinutes: SMS_OTP_EXPIRY_MINUTES })
    );
  });
