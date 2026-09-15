import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

function createBrowserClient() {
  if (!url || !publishableKey) return null;
  // This application uses publishable keys; server secret keys never belong in Vite env.
  if (!publishableKey.startsWith('sb_publishable_')) return null;
  try {
    return createClient(url, publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  } catch {
    return null;
  }
}

export const supabase = createBrowserClient();
