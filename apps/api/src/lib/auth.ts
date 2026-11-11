import { currentUserSchema } from '@ssm-usor/contracts';
import { createClient } from '@supabase/supabase-js';
import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import { decode } from 'hono/jwt';
import { endTime, startTime } from 'hono/timing';

import { requestFetch, supabaseConfig } from './db';
import { type ApiEnv, isProduction } from './env';
import { ApiError } from './errors';
import { refuseChangedIdentity } from './impersonation';

async function authenticate(c: Context<ApiEnv>) {
  const authorization = c.req.header('Authorization');
  const token = authorization?.match(/^Bearer ([^\s]+)$/i)?.[1];
  if (!token) throw new ApiError('unauthorized');

  const config = supabaseConfig(c);

  // No server session is stored. Every request verifies its own access token.
  const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: { fetch: requestFetch(c, 5_000) },
  });

  startTime(c, 'auth');
  const { data, error } = await supabase.auth.getUser(token);
  endTime(c, 'auth');
  if (error) {
    if (error.status === 401 || error.status === 403 || error.code === 'bad_jwt') {
      throw new ApiError('unauthorized');
    }
    console.error(
      `Authentication check failed: ${error.name} (status ${error.status ?? 'none'}, code ${error.code ?? 'none'}${c.req.raw.signal.aborted ? ', caller gone' : ''}): ${error.message}`
    );
    throw new ApiError('service_unavailable', 'Authentication is temporarily unavailable.');
  }

  if (!data.user || data.user.is_anonymous) throw new ApiError('unauthorized');

  // Whitelist the response fields; never expose the full Supabase user object.
  const user = currentUserSchema.safeParse({
    id: data.user.id,
    email: data.user.email ?? null,
  });
  if (!user.success) throw new ApiError('service_unavailable');

  c.set('user', user.data);
  c.set('emailConfirmed', Boolean(data.user.email_confirmed_at));
  // Only the secret key writes app_metadata, so the role is trusted. As in is_platform_admin(),
  // it gives an admin's power only to a session that passed its second factor (ADR 038).
  const adminClaim = data.user.app_metadata?.role === 'admin';
  c.set('adminClaim', adminClaim);
  const claims = tokenClaims(token);
  const platformAdmin = adminClaim && claims?.aal === 'aal2';
  c.set('platformAdmin', platformAdmin);
  // is_platform_admin() reads the token's claims, which outlive a role removed since it was
  // issued, so either one may have an impersonation in force.
  c.set('mayImpersonate', platformAdmin || isAdminToken(claims));
  c.set('accessToken', token);
}

// For the public app: the page the request comes from was built for whom it acts as (ADR 038).
export const requireAuth = createMiddleware<ApiEnv>(async (c, next) => {
  await authenticate(c);
  await refuseChangedIdentity(c);
  await next();
});

// No page of the admin app is built for a member.
export const requireAuthForAdmin = createMiddleware<ApiEnv>(async (c, next) => {
  await authenticate(c);
  await next();
});

type TokenClaims = ReturnType<typeof decode>['payload'];

// The token was verified with Supabase Auth, so its claims can be read without checking the
// signature again.
function tokenClaims(token: string): TokenClaims | undefined {
  try {
    return decode(token).payload;
  } catch {
    return undefined;
  }
}

const isAdminToken = (claims: TokenClaims | undefined) => {
  const appMetadata = claims?.app_metadata as { role?: unknown } | undefined;
  return appMetadata?.role === 'admin' && claims?.aal === 'aal2';
};

// After requireAuthForAdmin, on the Admin entrypoint (ADR 038).
export const requireAdmin = createMiddleware<ApiEnv>(async (c, next) => {
  if (!c.get('adminClaim')) throw new ApiError('forbidden', 'Admins only.');
  if (!c.get('platformAdmin')) {
    throw new ApiError(
      'forbidden',
      'Sign in with a second factor first.',
      undefined,
      'aal2_required'
    );
  }
  await next();
});

// The debugging aids and the tools for test data: anyone outside production, and in production a
// platform admin only.
export const adminToolsAllowed = (c: Context<ApiEnv>) =>
  !isProduction(c.env) || c.get('platformAdmin');
