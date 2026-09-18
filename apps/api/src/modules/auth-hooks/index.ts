import { z } from 'zod';

import { appOrigin } from '../../lib/env';
import { createRouter } from '../../router';
import { verifyWebhookSignature } from './signature';

// Supabase Auth calls this instead of sending its own email (ADR 002). It is not part of
// the OpenAPI document: the only caller is Supabase, and the SPA client has no use for it.

// How long a recovery link works: `otp_expiry` in supabase/config.toml, in minutes.
const OTP_EXPIRY_MINUTES = 60;

const sendEmailPayloadSchema = z.object({
  user: z.object({ email: z.email() }),
  email_data: z.object({
    token_hash: z.string().min(1),
    email_action_type: z.string().min(1),
  }),
});

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

  // Once enabled, the hook receives every email Supabase Auth would send. Only recovery is
  // in use; the others fail loudly here instead of silently never arriving.
  if (emailData.email_action_type !== 'recovery') {
    console.error(`Unsupported auth email type: ${emailData.email_action_type}`);
    return hookError(422, `Unsupported email type: ${emailData.email_action_type}.`);
  }

  // The link opens the SPA, which verifies the token only when the form is submitted, so
  // a mail scanner following the link cannot use it up.
  const resetUrl = new URL('/reset-password', appOrigin(c.env));
  resetUrl.searchParams.set('token_hash', emailData.token_hash);

  try {
    await mail.sendPasswordReset({
      to: user.email,
      resetUrl: resetUrl.href,
      expiresInMinutes: OTP_EXPIRY_MINUTES,
    });
  } catch (error) {
    console.error(
      `Password reset email failed: ${error instanceof Error ? error.name : 'unknown'}`
    );
    return hookError(500, 'The email could not be sent.');
  }

  return c.json({}, 200);
});
