# Deploy the application and API

The **Deploy non-prod** workflow (`.github/workflows/deploy-non-prod.yml`) deploys the affected
applications to non-prod after validation succeeds on a push to `main`; the **Deploy
production** workflow (`.github/workflows/deploy-production.yml`), run by hand from `main`,
releases what non-prod has run and deploys it to production
([ADR 025](architecture/adr-025-non-production-environment.md), [CI/CD](ci-cd.md#releases)).
Both run `.github/workflows/deploy-environment.yml`. Each application has its own deployment
job and can be released independently. Production's Workers and domains:

| Worker         | Custom domain    | Purpose                                         |
| -------------- | ---------------- | ----------------------------------------------- |
| `ssm-usor-api` | `api.ssmusor.ro` | Hono API and Supabase bearer-token verification |
| `ssm-usor-app` | `app.ssmusor.ro` | React SPA and static assets                     |

The portal's Worker, `ssm-usor-portal` at `portal.ssmusor.ro`, deploys the same way from the
same values; see the [portal guide](portal.md). Non-prod runs the same Workers with a
`-non-prod` suffix on hostnames under `non-prod.ssmusor.ro` (`api.non-prod.ssmusor.ro` and so on),
from the `non-prod` block of each `wrangler.jsonc`.

All of them disable `workers.dev` routes. Cloudflare creates the custom-domain DNS records and
certificates on deployment in the account hosting the active `ssmusor.ro` zone. Resolve any
conflicting records for these two subdomains before the first release. Marketing deploys
independently; see the [marketing deployment guide](deployment.md).

## One-time GitHub configuration

In **Settings → Environments**, the `non-prod` and `production` environments hold the same names
with each environment's own values; every build and deployment job uses the variables, secrets
and protection rules of the environment it deploys. Add these values to both:

| Name                                                            | Kind     | Value                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `API_URL`, `APP_URL`, `PORTAL_URL`, `MARKETING_URL`             | Variable | The environment's addresses without a trailing slash, `https://api.ssmusor.ro`, `https://app.ssmusor.ro`, `https://portal.ssmusor.ro`, `https://ssmusor.ro` in production and the `non-prod.ssmusor.ro` ones in non-prod. Built into the SPA, the portal and the marketing site, used by the deployment checks; the build fails without them. |
| `CLOUDFLARE_ACCOUNT_ID`                                         | Variable | Account hosting the `ssmusor.ro` zone; same account as marketing.                                                                                                                                                                                                                                                                             |
| `CLOUDFLARE_API_TOKEN`                                          | Secret   | Deployment token authorized to edit Workers, their custom-domain routes and Queues in this account/zone.                                                                                                                                                                                                                                      |
| `VITE_SUPABASE_URL`                                             | Variable | `https://xvhiwymggufbvjdfywjg.supabase.co` for the current project.                                                                                                                                                                                                                                                                           |
| `VITE_SUPABASE_PUBLISHABLE_KEY`                                 | Variable | The project's `sb_publishable_…` key from Supabase **Settings → API Keys**.                                                                                                                                                                                                                                                                   |
| `VITE_POSTHOG_PROJECT_TOKEN`                                    | Variable | Public project token for the production EU PostHog project. Without it, PostHog and Support are disabled in the SPA, and the marketing site sends no analytics (it reads the same variable as `PUBLIC_POSTHOG_PROJECT_TOKEN`).                                                                                                                |
| `POSTHOG_PROJECT_ID`                                            | Variable | Numeric project ID in the same EU PostHog project, used for source-map upload.                                                                                                                                                                                                                                                                |
| `POSTHOG_SOURCEMAPS_UPLOAD_KEY`                                 | Secret   | A PostHog personal API key, scoped to the organization with Error tracking: Write and Organization: Read, that uploads the SPA's and the portal's source maps during the build. One key serves both environments: it can only write source maps and error tracking. Never exposed as a `VITE_` value.                                         |
| `POSTHOG_SUPPORT_SECRET_KEY`                                    | Secret   | Secret key for signed Support widget identity, from the same PostHog project. Passed only to the API Worker.                                                                                                                                                                                                                                  |
| `E2E_EMAIL`                                                     | Secret   | Email of a test user on the hosted Supabase project. The local seed account does not exist there.                                                                                                                                                                                                                                             |
| `E2E_PASSWORD`                                                  | Secret   | Password for that test user.                                                                                                                                                                                                                                                                                                                  |
| `SUPABASE_PROJECT_ID`                                           | Variable | The project reference (`xvhiwymggufbvjdfywjg` for the current project).                                                                                                                                                                                                                                                                       |
| `SUPABASE_ACCESS_TOKEN`                                         | Secret   | A Supabase personal access token, used by the CLI to link the project for migrations.                                                                                                                                                                                                                                                         |
| `SUPABASE_DB_PASSWORD`                                          | Secret   | The project's database password from Supabase **Settings → Database**, used by `db push`.                                                                                                                                                                                                                                                     |
| `SUPABASE_SECRET_KEY`                                           | Secret   | The project's `sb_secret_…` key from **Settings → API Keys**, used by the seed workflow, the API's waitlist and the legislation Worker.                                                                                                                                                                                                       |
| `SUPABASE_AUTH_HOOK_SECRET`                                     | Secret   | Signs Supabase Auth's Send Email hook. We choose it: `v1,whsec_` followed by 32 random bytes in base64. CI gives the same value to Supabase and to the API.                                                                                                                                                                                   |
| `TURNSTILE_SITE_KEY`                                            | Variable | Site key of the same Turnstile widget, built into the marketing site; without it the form is a mailto link.                                                                                                                                                                                                                                   |
| `TURNSTILE_SECRET_KEY`                                          | Secret   | Secret key of the Turnstile widget protecting the marketing site's waitlist form.                                                                                                                                                                                                                                                             |
| `RESEND_API_KEY`                                                | Secret   | Sending-only Resend key for the mail Worker; see the [mail Worker guide](mail.md).                                                                                                                                                                                                                                                            |
| `SUPABASE_AUTH_SMS_HOOK_SECRET`                                 | Secret   | Signs Supabase Auth's Send SMS hook, chosen like `SUPABASE_AUTH_HOOK_SECRET` but a different value. CI gives the same value to Supabase and to the API.                                                                                                                                                                                       |
| `SIGNING_CA_KEY`                                                | Secret   | The app's signing authority's P-256 private key, PKCS#8 PEM (ADR 023). `pnpm --filter @ssm-usor/api signing:ca` makes it with the next two; passed only to the API Worker. Losing it leaves earlier certificates unverifiable against new ones, so keep it.                                                                                   |
| `SIGNING_CA_CERT`                                               | Secret   | That authority's self-signed certificate, PEM, ten years.                                                                                                                                                                                                                                                                                     |
| `SIGNING_KEY_ENCRYPTION_KEY`                                    | Secret   | 32 random bytes, base64: the AES-256-GCM key under which signers' private keys are stored. A new value makes every signer's identity reissue at their next signature.                                                                                                                                                                         |
| `TWILIO_ACCOUNT_SID`                                            | Variable | The Twilio account the SMS Worker sends through; see the [SMS Worker guide](sms.md).                                                                                                                                                                                                                                                          |
| `TWILIO_AUTH_TOKEN`                                             | Secret   | The auth token of that Twilio account, the one value of the three that is a secret.                                                                                                                                                                                                                                                           |
| `SMS_FROM`                                                      | Variable | The SMS sender: `SSMUsor`, a Twilio number, or a Messaging Service SID. Without all three Twilio values the SMS Worker only logs.                                                                                                                                                                                                             |
| `SEED_ALLOW_FAKE`                                               | Variable | `true` to let the seed workflow add fake clients and employees: in `non-prod` only, never in `production`.                                                                                                                                                                                                                                    |
| `SEED_ADMIN_PASSWORD`                                           | Secret   | The administrator's password. The seed workflow refuses to run without it, because the seed script's default is printed in this repository.                                                                                                                                                                                                   |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_NAME`, `SEED_ORGANIZATION_NAME` | Variable | Optional overrides for the seeded account, its profile name, and the organization name.                                                                                                                                                                                                                                                       |

The Cloudflare account ID and deployment token are shared with marketing.
All applications deploy selectively after successful validation, to non-prod on `main` and to
production on a release. Marketing has an independent deployment job. See [CI/CD](ci-cd.md)
for change selection, artifacts, caching, and recovery.

Repository-level variables and secrets also work, but values scoped to other environments
are unavailable here. The Cloudflare **Edit Cloudflare Workers** token template is a starting
point; scope it to the account and zone hosting this project, as described in the marketing
deployment guide.

PostHog setup is a separate release prerequisite. Create a production project in the EU region,
enable Error Tracking, Session Replay, and Support, and allow the `app.ssmusor.ro` widget domain.
Set the Support greeting and email notification for new tickets in PostHog. Set session replay
sampling to 100% for the pilot and verify the desired retention there. Store the four values above
in the `production` GitHub environment before deploying. The build uploads hidden JavaScript source
maps only when the personal API key and project ID are set; the plugin removes them from the release
after upload. For local development use a separate EU project and leave the token unset by default.

The workflow builds `API_URL` into the SPA and the portal as `VITE_API_URL`, and
`API_URL`, `APP_URL` and `MARKETING_URL` into the marketing site as `PUBLIC_API_URL`,
`PUBLIC_APP_URL` and `PUBLIC_SITE_URL`.
It builds the public Supabase settings into the SPA and passes the same settings to
the API as `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`. These are public configuration,
not administrator credentials. The access token and database password are used only by the
**Deploy database migrations** job to push checked-in migrations and never reach the Workers.
The Supabase secret key is used by the **Seed database** workflow and uploaded to the API as
a Worker secret together with `TURNSTILE_SECRET_KEY`; the API reads it only for the
[waitlist](api.md#waitlist). The API deploys without either secret, with a warning, and the
waitlist answers `503` until both exist.

## Rotating the signing keys

The three `SIGNING_*` secrets are the app's own certificate authority and the key under which
signers' private keys are stored ([ADR 023](architecture/adr-023-advanced-electronic-signature.md)).
Nothing rotates them on a schedule. Rotate when a value may have leaked or was lost, and roll the
authority well before its certificate's ten years run out.

**Backups first.** Keep the three values that are in force, and every authority certificate ever
used, in the password manager, each under the date it was made; never in the repository or a
ticket. A database backup holds the signers' private keys only encrypted under the key-encryption
key, so neither is any use without the other. Losing the key-encryption key costs nothing but
reissued identities; losing the authority's key means rolling the authority, below.

**The key-encryption key.** `SIGNING_KEY_ENCRYPTION_KEY` encrypts each signer's private key, and
`signing_identities.key_version` says under which key a row was made.

1. Make a new value, 32 random bytes in base64 (`openssl rand -base64 32`), and raise
   `KEY_VERSION` in `apps/api/src/lib/signing-ca.ts` in a pull request of its own.
2. Replace the secret in the `production` GitHub environment, then merge: the API's deployment
   uploads the secret, so the new version and the new key arrive together.
3. An identity of the old version no longer decrypts, so each is reissued at its owner's next
   signature, as a new row under the new version; the earlier rows stay as history, and the
   signatures already made keep their certificates inside the PDFs. The old key is not needed
   again; keep it with the backup until the next rotation, then delete it.

**The authority.** `SIGNING_CA_KEY` and `SIGNING_CA_CERT` change together.

1. `pnpm --filter @ssm-usor/api signing:ca` prints a new authority, with a new key-encryption key
   that may be left unused. Put the two authority values into the `production` environment and
   deploy the API again, which uploads them as Worker secrets.
2. Every identity was issued under the old authority, so each is reissued at its owner's next
   signature under the new one.
3. Keep the old certificate for good: each signature carries its own certificate and its
   authority's, so a sheet signed before the roll still verifies, but whoever checks it against
   the authorities the app has used needs both certificates as trust roots, the old one for the
   signatures before the roll and the new one for those after. A sheet can hold both.
4. Delete the old authority's key once the new one is deployed: nothing signs with it again.

Locally, a new `pnpm --filter @ssm-usor/api signing:ca` in `apps/api/.dev.vars` does the same to
the local stack's identities.

## Seed the hosted project

The **Seed database** workflow (`.github/workflows/seed.yml`) is run by hand from the Actions
tab, for the environment chosen in its `environment` input (`non-prod` by default). It ensures the admin user, the organization, and the owner membership, and can add
deterministic fake clients and employees when the `fake` input is set and the environment allows it
(`SEED_ALLOW_FAKE`, set in non-prod only). It refuses to run without `SEED_ADMIN_PASSWORD`. The
seed is idempotent: rerunning it updates the same rows. Run it after a new project is created
or when fresh fake data is wanted; it is not part of any release. The same script runs locally
as `pnpm seed`, see the [development admin guide](development-admin.md).
The E2E credentials belong to an existing test user in the same Supabase project. The test
only signs in, reads its account identity, refreshes, and signs out; it does not require admin
permissions or create users. Missing test credentials fail the authenticated check, which is
currently advisory and does not block deployment.

Local `.env.local` and `.dev.vars` files are ignored by Git and are not uploaded by the
workflow. API `keep_vars: true` retains the deployed public bindings on subsequent manual
Wrangler deployments; this workflow explicitly updates them on every release. Production
`CORS_ORIGINS` is set to `https://app.ssmusor.ro` in the API Wrangler configuration.

## Release

1. Merge or push the changes to `main`; follow the **Deploy non-prod** run in GitHub Actions, which
   takes them to non-prod. Steps 2 to 7 then run there.
2. CI validates generated code, lint, types, and tests once for the revision.
3. Only affected applications are built and checked with Wrangler's dry run. The SPA build
   receives production public settings. Validated Worker bundles and static assets are uploaded
   as artifacts and downloaded by deployment jobs; those jobs do not rebuild the applications.
4. If `supabase/migrations` changed, the database job links the hosted project and applies the
   pending migrations. Migrations are forward-only; fix problems with a corrective migration.
   The API deployment waits for this job when both are selected.
5. If the API changed, its job deploys the validated bundle and checks health, OpenAPI, CORS
   preflight, and rejection of missing and invalid bearer tokens. No Chromium installation is needed.
6. If the SPA changed, its job deploys the validated assets. When the API is also selected,
   its deployment and smoke tests must succeed first; an unchanged API is skipped.
7. After an SPA deployment, Chromium checks login rendering, form validation, the signed-out
   redirect, and the authenticated identity/session/sign-out flow against the deployed services.
   API-only releases run the API checks; they do not redeploy or run browser checks for the SPA.
8. Once non-prod has run the commit, run **Deploy production** from `main` with the tag left
   empty. It takes the newest commit a **Deploy non-prod** run succeeded for, tags it with the
   date (`2026.10.23`, `2026.10.23.2` for a second one that day), publishes the GitHub release,
   then runs steps 2 to 7 against production, selecting what changed since the release
   production runs. To roll back, run it with an earlier release's tag: that release is
   deployed again, everything of it ([CI/CD](ci-cd.md#releases)).

Browser verification is currently **non-blocking**: readiness, UI, or login failures leave a
warning and job summary while allowing a successful deployment result. Browser report uploads
are also best-effort. Build, validation, Worker upload, browser installation, and API checks still fail the workflow
on error. A successful deployment with a browser warning does not mean the user flow was verified.

Before either browser project runs, a shared Playwright `app-ready` setup project polls
`/login` with Chromium for up to five minutes, waiting for DNS, HTTPS, and an HTML response.
It runs once per invocation, and a failure prevents the dependent browser tests from running.
The login and account assertions then run with their normal, shorter timeouts. API health
checks also poll for availability. If initial DNS or certificate provisioning takes longer,
inspect Cloudflare's domain status and rerun the workflow once ready. API checks use
Playwright’s HTTP request fixture; browser checks exercise
the deployed React application without mocking Supabase or the API. No user is seeded during deployment.

Each executed verification stage uploads a separate Playwright HTML report retained for seven days. Failed public
browser tests also capture a trace and screenshot. Authentication traces, screenshots, and
videos are disabled to keep credentials and session tokens out of those artifacts.

Main workflow runs are queued and are not automatically canceled by newer pushes. Each Worker
version is tagged with the full Git commit SHA. When both applications change, the two deployments
are **not atomic**: if the SPA upload fails, the API may already be live. Browser warnings leave the
new SPA in place. API changes must remain compatible with the previous SPA during deployment.

If deployment fails, resolve the cause and rerun the failed job in the original **CI** run while
its release artifact is available (seven days). A rerun uses the original commit: do not rerun an
old deployment over a newer successful release. Later unrelated pushes do not automatically retry
failed releases. For expired artifacts, rerun all jobs only if that revision is still the intended
release; otherwise push a fix affecting the application. For rollback, select the known-good Worker
version in Cloudflare; coordinate both Workers when their contracts require it.

Email/password login needs no callback URL. Set Supabase's Site URL to `https://app.ssmusor.ro`
and configure redirect URLs when adding password reset, email confirmation, or OAuth.

## Local verification

These commands validate packaging without publishing:

```bash
pnpm check:generated
pnpm lint
pnpm typecheck
pnpm test
pnpm deploy:dry-run
```

## Playwright deployment tests

Tests live in `apps/app/e2e`, configured by `apps/app/playwright.config.ts`. Vitest remains
responsible for unit and integration tests; `pnpm test` does not run tests against live services.
Playwright specs and configuration are included in the app's normal type checks.

Install the browser once:

```bash
pnpm --filter @ssm-usor/app exec playwright install chromium
```

To run against a deployment, export its origins and the existing test user's credentials in
your shell (`E2E_EMAIL` and `E2E_PASSWORD`):

```bash
export E2E_API_URL=https://api.ssmusor.ro
export E2E_APP_URL=https://app.ssmusor.ro
pnpm --filter @ssm-usor/app test:e2e
```

The projects can also run independently:

```bash
pnpm --filter @ssm-usor/app test:e2e --project=api
pnpm --filter @ssm-usor/app test:e2e --project=chromium
pnpm --filter @ssm-usor/app test:e2e --project=authenticated
```

Only `authenticated` requires credentials; it fails explicitly if they are missing. It is
run after each SPA deployment, but its failure is advisory. Use the [development account](development-admin.md)
for local checks against our development Supabase project.

For local production-preview testing, the default origins are `http://localhost:8787` (API)
and `http://localhost:4174` (SPA). Add `http://localhost:4174` to `CORS_ORIGINS` in
`apps/api/.dev.vars`, retaining your Vite origins, then run:

```bash
pnpm --filter @ssm-usor/contracts build
pnpm dev:api
# In another terminal:
VITE_API_URL=http://localhost:8787 pnpm --filter @ssm-usor/app build
pnpm --filter @ssm-usor/app exec wrangler dev --port 4174
# In another terminal, with E2E_EMAIL and E2E_PASSWORD exported:
pnpm --filter @ssm-usor/app test:e2e
```

The SPA build also needs the public Supabase values in `apps/app/.env.local`. Local servers
are started explicitly so the tests can target either a local preview or a deployed environment.
Generated reports and test results are ignored by Git, ESLint, and Prettier.

For manual deployment, authenticate with `pnpm --filter @ssm-usor/api exec wrangler login`,
build `@ssm-usor/contracts`, and configure the API's deployed Supabase bindings before
`pnpm deploy:api`. Build the SPA with all three production `VITE_*` values before publishing
via `pnpm deploy:app`; this command builds using the current shell and local env files.
Prefer automatic CI deployment, since local files may still point at local services.
