import type { MailService } from '@ssm-usor/contracts';
import { z } from 'zod';

import { appOrigin } from '../../lib/env';
import { createRouter } from '../../router';
import { verifyWebhookSignature } from './signature';

// Supabase Auth calls this instead of sending its own email (ADR 002). It is not part of
// the OpenAPI document: the only caller is Supabase, and the SPA client has no use for it.

// How long an emailed link works: `otp_expiry` in supabase/config.toml, in minutes.
const OTP_EXPIRY_MINUTES = 60;

const sendEmailPayloadSchema = z.object({
  user: z.object({ email: z.email() }),
  email_data: z.object({
    // Empty for a notification, which asks nothing of the person and carries no link of
    // Supabase's.
    token_hash: z.string().optional(),
    email_action_type: z.string().min(1),
  }),
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
const hookError = (status: 400 | 401 | 422 | 500 | 503, message: string) =>
  Response.json({ error: { http_code: status, message } }, { status });

export const authHooksRouter = createRouter().post('/hooks/supabase/send-email', async (c) => {
  const secret = c.env.SUPABASE_AUTH_HOOK_SECRET;
  const mail = c.env.MAIL;
  if (!secret || !mail) return hookError(503, 'The email hook is not configured.');

  // The signature covers the exact bytes, so the body is read as text before parsing.
  const body = await c.req.text();
  const verified = await verifyWebhookSignature(secret, {
    id: c.req.header('webhook-id'),
    timestamp: c.req.header('webhook-timestamp'),
    signature: c.req.header('webhook-signature'),
    body,
  });
  if (!verified) return hookError(401, 'Invalid signature.');

  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return hookError(400, 'The payload is not JSON.');
  }
  const payload = sendEmailPayloadSchema.safeParse(json);
  if (!payload.success) return hookError(400, 'The payload is not a Send Email hook payload.');
  const { user, email_data: emailData } = payload.data;

  // Once enabled, the hook receives every email Supabase Auth would send. The types not in
  // use fail loudly here instead of silently never arriving.
  const notification = notifications[emailData.email_action_type];
  const email = notification ?? emails[emailData.email_action_type];
  if (!email) {
    console.error(`Unsupported auth email type: ${emailData.email_action_type}`);
    return hookError(422, `Unsupported email type: ${emailData.email_action_type}.`);
  }

  // Each link opens a page of the SPA that verifies the token only when its form or button
  // is submitted, so a mail scanner following the link cannot use it up. The redirect
  // Supabase was asked for is ignored, so the link cannot leave the SPA.
  const url = new URL(email.path, appOrigin(c.env));
  if (!notification) {
    if (!emailData.token_hash) return hookError(400, 'The payload has no token hash.');
    url.searchParams.set('token_hash', emailData.token_hash);
  }

  try {
    await email.send(mail, user.email, url.href);
  } catch (error) {
    console.error(`Auth email failed: ${error instanceof Error ? error.name : 'unknown'}`);
    return hookError(500, 'The email could not be sent.');
  }

  return c.json({}, 200);
});
