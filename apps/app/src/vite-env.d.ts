/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_HELP_URL?: string;
  // The admin area's origin on a host not named app.*; local development defaults to its port.
  readonly VITE_ADMIN_URL?: string;
  // 'true' shows the link to /inregistrare on the login page. Off until registration is public.
  readonly VITE_REGISTRATION_LINK?: string;
  readonly VITE_COMMIT_SHA?: string;
  readonly VITE_RELEASE_TAG?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_TURNSTILE_SITE_KEY?: string;
  readonly VITE_POSTHOG_PROJECT_TOKEN?: string;
  readonly VITE_STRIPE_PUBLISHABLE_KEY?: string;
}
