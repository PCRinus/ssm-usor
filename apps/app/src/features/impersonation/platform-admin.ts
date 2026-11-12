import type { Session } from '@supabase/supabase-js';

// The claim the database reads in is_platform_admin(); `GET /me` does not say it. It only
// decides what this account sees, never what it may do.
export function isPlatformAdmin(session: Session | null) {
  return session?.user.app_metadata?.role === 'admin';
}

export function adminAreaUrl(location: Pick<Location, 'protocol' | 'hostname'> = window.location) {
  if (location.hostname.startsWith('app.')) {
    return `${location.protocol}//admin.${location.hostname.slice('app.'.length)}/`;
  }
  return import.meta.env.VITE_ADMIN_URL ?? 'http://localhost:5176/';
}
