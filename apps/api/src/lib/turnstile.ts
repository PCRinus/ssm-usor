import type { Context } from 'hono';

import { requestFetch } from './db';
import type { ApiEnv } from './env';
import { ApiError } from './errors';

const endpoint = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** Resolves to whether Cloudflare Turnstile accepts the token the browser obtained. */
export async function verifyTurnstile(c: Context<ApiEnv>, token: string): Promise<boolean> {
  const secret = c.env.TURNSTILE_SECRET_KEY;
  if (!secret) throw new ApiError('service_unavailable');

  const body = new URLSearchParams({ secret, response: token });
  const ip = c.req.header('CF-Connecting-IP');
  if (ip) body.set('remoteip', ip);

  let response: Response;
  try {
    response = await requestFetch(c, 5_000)(endpoint, { method: 'POST', body });
  } catch {
    throw new ApiError('service_unavailable');
  }
  if (!response.ok) throw new ApiError('service_unavailable');

  const result = (await response.json()) as { success?: boolean };
  return result.success === true;
}
