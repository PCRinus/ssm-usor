/// <reference types="astro/client" />

interface ImportMetaEnv {
  /** Without it the waitlist form falls back to a mailto link. */
  readonly PUBLIC_TURNSTILE_SITE_KEY?: string;
  /** Defaults to https://api.ssmusor.ro. */
  readonly PUBLIC_API_URL?: string;
  /** Where the login link points. Defaults to https://app.ssmusor.ro. */
  readonly PUBLIC_APP_URL?: string;
  /**
   * The site's own address, read by astro.config.mjs as `site`, and the only host analytics run
   * on. Defaults to https://ssmusor.ro.
   */
  readonly PUBLIC_SITE_URL?: string;
  readonly PUBLIC_COMMIT_SHA?: string;
  /** Without it the site sends no analytics. Each environment's build has its own project's. */
  readonly PUBLIC_POSTHOG_PROJECT_TOKEN?: string;
}
