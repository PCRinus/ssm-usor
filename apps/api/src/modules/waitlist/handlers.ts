import type { RouteHandler } from '@hono/zod-openapi';
import type { WaitlistSubscribeResponse } from '@ssm-usor/contracts';

import { createAdminClient } from '../../lib/admin-db';
import { fromDatabaseError } from '../../lib/db';
import { type ApiEnv, apiOrigin, marketingOrigin } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import { createToken, hashToken } from '../../lib/tokens';
import { verifyTurnstile } from '../../lib/turnstile';
import type { confirmWaitlistRoute, subscribeToWaitlistRoute } from './routes';

// A pending address gets at most one confirmation email in this window, so the form
// cannot be used to flood someone's inbox.
const RESEND_AFTER_MS = 10 * 60 * 1000;

const accepted = { status: 'confirmation_pending' } satisfies WaitlistSubscribeResponse;

export const subscribeToWaitlist: RouteHandler<typeof subscribeToWaitlistRoute, ApiEnv> = async (
  c
) => {
  const { email, consentVersion, turnstileToken } = c.req.valid('json');

  if (!(await verifyTurnstile(c, turnstileToken))) {
    throw new ApiError('validation_error', 'The anti-spam check failed. Try again.', [
      { path: 'turnstileToken', message: 'Rejected by Turnstile.' },
    ]);
  }

  const mail = c.env.MAIL;
  if (!mail) throw new ApiError('service_unavailable');

  const db = createAdminClient(c);
  const existing = await db
    .from('waitlist_subscribers')
    .select('id, confirmed_at, confirmation_sent_at')
    .eq('email', email)
    .maybeSingle();
  if (existing.error) throw fromDatabaseError(existing.error, 'waitlist lookup');

  const subscriber = existing.data;
  if (subscriber?.confirmed_at) return c.json(accepted, 202);
  if (
    subscriber?.confirmation_sent_at &&
    Date.now() - Date.parse(subscriber.confirmation_sent_at) < RESEND_AFTER_MS
  ) {
    return c.json(accepted, 202);
  }

  // Every email carries a fresh token; an older link stops working once a new one is sent.
  const token = createToken();
  const row = {
    email,
    consent_version: consentVersion,
    confirmation_token_hash: await hashToken(token),
  };
  const saved = await db
    .from('waitlist_subscribers')
    .upsert(row, { onConflict: 'email' })
    .select('id')
    .single();
  if (saved.error) throw fromDatabaseError(saved.error, 'waitlist save');

  const confirmUrl = new URL('/waitlist/confirm', apiOrigin(c.env));
  confirmUrl.searchParams.set('token', token);

  try {
    await mail.sendWaitlistConfirmation({ to: email, confirmUrl: confirmUrl.href });
  } catch (error) {
    // The sent time is left as it was, so the person can retry right away.
    console.error(
      `Waitlist confirmation email failed: ${error instanceof Error ? error.name : 'unknown'}`
    );
    throw new ApiError('service_unavailable', 'The confirmation email could not be sent.');
  }

  const marked = await db
    .from('waitlist_subscribers')
    .update({ confirmation_sent_at: new Date().toISOString() })
    .eq('id', saved.data.id);
  if (marked.error) throw fromDatabaseError(marked.error, 'waitlist mark sent');

  return c.json(accepted, 202);
};

export const confirmWaitlist: RouteHandler<typeof confirmWaitlistRoute, ApiEnv> = async (c) => {
  const invalidLink = `${marketingOrigin(c.env)}/abonare/link-invalid/`;
  const { token } = c.req.valid('query');
  if (!token) return c.redirect(invalidLink, 303);

  const db = createAdminClient(c);
  const tokenHash = await hashToken(token);

  // Following the link twice is fine: the row is matched whether or not it is confirmed yet.
  const found = await db
    .from('waitlist_subscribers')
    .select('id, confirmed_at')
    .eq('confirmation_token_hash', tokenHash)
    .maybeSingle();
  if (found.error) throw fromDatabaseError(found.error, 'waitlist confirm lookup');
  if (!found.data) return c.redirect(invalidLink, 303);

  if (!found.data.confirmed_at) {
    const confirmed = await db
      .from('waitlist_subscribers')
      .update({ confirmed_at: new Date().toISOString() })
      .eq('id', found.data.id);
    if (confirmed.error) throw fromDatabaseError(confirmed.error, 'waitlist confirm');
  }

  return c.redirect(`${marketingOrigin(c.env)}/abonare/confirmata/`, 303);
};
