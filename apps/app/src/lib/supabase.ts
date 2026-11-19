import { createSupabaseClient } from '@ssm-usor/spa-runtime/session';

export const supabase = createSupabaseClient({
  url: import.meta.env.VITE_SUPABASE_URL,
  publishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  flowType: 'pkce',
});
