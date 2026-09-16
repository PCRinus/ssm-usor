import { currentUserSchema } from '@ssm-usor/contracts';
import { createClient } from '@supabase/supabase-js';
import { createMiddleware } from 'hono/factory';

import { type ApiEnv, supabaseConfigSchema } from './env';
import { ApiError } from './errors';

export const requireAuth = createMiddleware<ApiEnv>(async (c, next) => {
  const authorization = c.req.header('Authorization');
  const token = authorization?.match(/^Bearer ([^\s]+)$/i)?.[1];
  if (!token) throw new ApiError('unauthorized');

  const config = supabaseConfigSchema.safeParse(c.env);
  if (!config.success) throw new ApiError('service_unavailable');

  // No server session is stored. Every request verifies its own access token.
  const supabase = createClient(config.data.SUPABASE_URL, config.data.SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          signal: AbortSignal.any([c.req.raw.signal, AbortSignal.timeout(5_000)]),
        }),
    },
  });

  const { data, error } = await supabase.auth.getUser(token);
  if (error) {
    if (error.status === 401 || error.status === 403 || error.code === 'bad_jwt') {
      throw new ApiError('unauthorized');
    }
    throw new ApiError('service_unavailable');
  }

  if (!data.user || data.user.is_anonymous) throw new ApiError('unauthorized');

  // Whitelist the response fields; never expose the full Supabase user object.
  const user = currentUserSchema.safeParse({
    id: data.user.id,
    email: data.user.email ?? null,
  });
  if (!user.success) throw new ApiError('service_unavailable');

  c.set('user', user.data);
  await next();
});
