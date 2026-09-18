# Deploy the application and API

The **CI** workflow (`.github/workflows/ci.yml`) automatically deploys the affected API
and SPA applications after validation succeeds on a push to `main`. Each application
has its own deployment job and can be released independently:

| Worker         | Custom domain    | Purpose                                         |
| -------------- | ---------------- | ----------------------------------------------- |
| `ssm-usor-api` | `api.ssmusor.ro` | Hono API and Supabase bearer-token verification |
| `ssm-usor-app` | `app.ssmusor.ro` | React SPA and static assets                     |

Both disable `workers.dev` routes. Cloudflare creates the custom-domain DNS records and
certificates on deployment in the account hosting the active `ssmusor.ro` zone. Resolve any
conflicting records for these two subdomains before the first release. Marketing deploys
independently; see the [marketing deployment guide](deployment.md).

## One-time GitHub configuration

In **Settings → Environments**, use the shared `production` environment. Production build
and deployment jobs use its variables, secrets, and protection rules. Add these values for the API and SPA:

| Name                                                            | Kind     | Value                                                                                                                                                       |
| --------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CLOUDFLARE_ACCOUNT_ID`                                         | Variable | Account hosting the `ssmusor.ro` zone; same account as marketing.                                                                                           |
| `CLOUDFLARE_API_TOKEN`                                          | Secret   | Deployment token authorized to edit Workers and their custom-domain routes in this account/zone.                                                            |
| `VITE_SUPABASE_URL`                                             | Variable | `https://xvhiwymggufbvjdfywjg.supabase.co` for the current project.                                                                                         |
| `VITE_SUPABASE_PUBLISHABLE_KEY`                                 | Variable | The project's `sb_publishable_…` key from Supabase **Settings → API Keys**.                                                                                 |
| `E2E_EMAIL`                                                     | Secret   | Email of an existing Supabase test user.                                                                                                                    |
| `E2E_PASSWORD`                                                  | Secret   | Password for that test user.                                                                                                                                |
| `SUPABASE_PROJECT_ID`                                           | Variable | The project reference (`xvhiwymggufbvjdfywjg` for the current project).                                                                                     |
| `SUPABASE_ACCESS_TOKEN`                                         | Secret   | A Supabase personal access token, used by the CLI to link the project for migrations.                                                                       |
| `SUPABASE_DB_PASSWORD`                                          | Secret   | The project's database password from Supabase **Settings → Database**, used by `db push`.                                                                   |
| `SUPABASE_SECRET_KEY`                                           | Secret   | The project's `sb_secret_…` key from **Settings → API Keys**, used by the seed workflow and the API's waitlist.                                             |
| `SUPABASE_AUTH_HOOK_SECRET`                                     | Secret   | Signs Supabase Auth's Send Email hook. We choose it: `v1,whsec_` followed by 32 random bytes in base64. CI gives the same value to Supabase and to the API. |
| `TURNSTILE_SITE_KEY`                                            | Variable | Site key of the same Turnstile widget, built into the marketing site; without it the form is a mailto link.                                                 |
| `TURNSTILE_SECRET_KEY`                                          | Secret   | Secret key of the Turnstile widget protecting the marketing site's waitlist form.                                                                           |
| `RESEND_API_KEY`                                                | Secret   | Sending-only Resend key for the mail Worker; see the [mail Worker guide](mail.md).                                                                          |
| `SEED_ALLOW_FAKE`                                               | Variable | `true` to let the seed workflow add fake clients and employees; leave unset on a real production project.                                                   |
| `SEED_ADMIN_PASSWORD`                                           | Secret   | Only for the workflow's `reset-password` input or a first creation; otherwise not needed.                                                                   |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_NAME`, `SEED_ORGANIZATION_NAME` | Variable | Optional overrides for the seeded account, its profile name, and the organization name.                                                                     |

The Cloudflare account ID and deployment token are shared with marketing.
All three applications deploy automatically and selectively after successful validation on
`main`. Marketing has an independent deployment job. Main workflow runs are queued without
automatically canceling active or pending releases. See [CI/CD](ci-cd.md) for change selection,
artifact reuse, caching, and recovery.

Repository-level variables and secrets also work, but values scoped to other environments
are unavailable here. The Cloudflare **Edit Cloudflare Workers** token template is a starting
point; scope it to the account and zone hosting this project, as described in the marketing
deployment guide.

The workflow fixes `VITE_API_URL` to `https://api.ssmusor.ro`; no GitHub variable is needed
for it. It builds the public Supabase settings into the SPA and passes the same settings to
the API as `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`. These are public configuration,
not administrator credentials. The access token and database password are used only by the
**Deploy database migrations** job to push checked-in migrations and never reach the Workers.
The Supabase secret key is used by the **Seed database** workflow and uploaded to the API as
a Worker secret together with `TURNSTILE_SECRET_KEY`; the API reads it only for the
[waitlist](api.md#waitlist). The API deploys without either secret, with a warning, and the
waitlist answers `503` until both exist.

## Seed the hosted project

The **Seed database** workflow (`.github/workflows/seed.yml`) is run by hand from the Actions
tab. It ensures the admin user, the organization, and the owner membership, and can add
deterministic fake clients and employees when the `fake` input is set and the environment allows it. The
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

1. Merge or push the changes to `main`; follow the **CI** run in GitHub Actions.
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
