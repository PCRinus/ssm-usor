/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  // 'true' shows the link to /register on the login page. Off until registration is public.
  readonly VITE_REGISTRATION_LINK?: string;
  readonly VITE_COMMIT_SHA?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_POSTHOG_PROJECT_TOKEN?: string;
}
