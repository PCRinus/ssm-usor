/// <reference types="astro/client" />

interface ImportMetaEnv {
  /** Without it the waitlist form falls back to a mailto link. */
  readonly PUBLIC_TURNSTILE_SITE_KEY?: string;
  /** Defaults to https://api.ssmusor.ro. */
  readonly PUBLIC_API_URL?: string;
  readonly PUBLIC_COMMIT_SHA?: string;
  /** Without it the site sends no analytics. Belongs only in the production build. */
  readonly PUBLIC_POSTHOG_PROJECT_TOKEN?: string;
}
