/// <reference types="astro/client" />

interface ImportMetaEnv {
  /** Turnstile widget site key. Without it the waitlist form falls back to a mailto link. */
  readonly PUBLIC_TURNSTILE_SITE_KEY?: string;
  /** Defaults to https://api.ssmusor.ro. */
  readonly PUBLIC_API_URL?: string;
  /** Full Git commit SHA embedded in the static build. */
  readonly PUBLIC_COMMIT_SHA?: string;
}
