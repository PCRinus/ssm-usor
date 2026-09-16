# Deploy the application and API

The manual GitHub Actions workflow **Deploy app** (`.github/workflows/deploy-app.yml`)
deploys two Cloudflare Workers from the same selected Git revision:

| Worker         | Custom domain    | Purpose                                         |
| -------------- | ---------------- | ----------------------------------------------- |
| `ssm-usor-api` | `api.ssmusor.ro` | Hono API and Supabase bearer-token verification |
| `ssm-usor-app` | `app.ssmusor.ro` | React SPA and static assets                     |

Both disable `workers.dev` routes. Cloudflare creates the custom-domain DNS records and
certificates on deployment in the account hosting the active `ssmusor.ro` zone. Resolve any
conflicting records for these two subdomains before the first release. Marketing deploys
independently; see the [marketing deployment guide](deployment.md).

## One-time GitHub configuration

In **Settings → Environments**, use the shared `production` environment. Both deployment
workflows use its variables, secrets, and protection rules. Add these values for the API and SPA:

| Name                            | Kind     | Value                                                                                            |
| ------------------------------- | -------- | ------------------------------------------------------------------------------------------------ |
| `CLOUDFLARE_ACCOUNT_ID`         | Variable | Account hosting the `ssmusor.ro` zone; same account as marketing.                                |
| `CLOUDFLARE_API_TOKEN`          | Secret   | Deployment token authorized to edit Workers and their custom-domain routes in this account/zone. |
| `VITE_SUPABASE_URL`             | Variable | `https://xvhiwymggufbvjdfywjg.supabase.co` for the current project.                              |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Variable | The project's `sb_publishable_…` key from Supabase **Settings → API Keys**.                      |
| `E2E_EMAIL`                     | Secret   | Email of an existing Supabase test user.                                                         |
| `E2E_PASSWORD`                  | Secret   | Password for that test user.                                                                     |

The Cloudflare account ID and deployment token are shared with marketing.
Marketing deploys automatically after successful CI on `main`, while **Deploy app** remains
manual. Each workflow has its own concurrency group so they can deploy independently.

Repository-level variables and secrets also work, but values scoped to other environments
are unavailable here. The Cloudflare **Edit Cloudflare Workers** token template is a starting
point; scope it to the account and zone hosting this project, as described in the marketing
deployment guide.

The workflow fixes `VITE_API_URL` to `https://api.ssmusor.ro`; no GitHub variable is needed
for it. It builds the public Supabase settings into the SPA and passes the same settings to
the API as `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`. These are public configuration,
not administrator credentials. No Supabase secret/service-role key belongs in this workflow.
The E2E credentials belong to an existing test user in the same Supabase project. The test
only signs in, reads its account identity, refreshes, and signs out; it does not require admin
permissions or create users. Missing test credentials fail the authenticated check, which is
currently advisory and does not block deployment.

Local `.env.local` and `.dev.vars` files are ignored by Git and are not uploaded by the
workflow. API `keep_vars: true` retains the deployed public bindings on subsequent manual
Wrangler deployments; this workflow explicitly updates them on every release. Production
`CORS_ORIGINS` is set to `https://app.ssmusor.ro` in the API Wrangler configuration.

## Release

1. Commit and push the changes to GitHub.
2. Open **Actions → Deploy app → Run workflow** and select the intended branch or tag.
3. The workflow validates configuration, generated code, lint, types, and tests, then builds
   both applications and their workspace dependencies.
4. It deploys the API and checks health, OpenAPI, CORS preflight, and rejection of missing
   and invalid bearer tokens. If a check fails, SPA deployment does not start.
5. It deploys the SPA and runs Chromium tests for login rendering, form validation, and the
   signed-out redirect from `/dashboard`.
6. An authenticated Chromium test signs in through Supabase, checks the real API identity
   appears, refreshes `/dashboard` to verify session restoration, signs out, and checks the guard again.

Browser verification is currently **non-blocking**: readiness, UI, or login failures leave a
warning and job summary while allowing a successful deployment result. Browser report uploads
are also best-effort. Build, validation, Worker upload, and API checks still fail the workflow
on error. A successful deployment with a browser warning does not mean the user flow was verified.

Before either browser project runs, a shared Playwright `app-ready` setup project polls
`/login` with Chromium for up to five minutes, waiting for DNS, HTTPS, and an HTML response.
It runs once per invocation, and a failure prevents the dependent browser tests from running.
The login and account assertions then run with their normal, shorter timeouts. API health
checks also poll for availability. If initial DNS or certificate provisioning takes longer,
inspect Cloudflare's domain status and rerun the workflow once ready. API checks use
Playwright’s HTTP request fixture; browser checks exercise
the deployed React application without mocking Supabase or the API. No user is seeded during deployment.

Each stage uploads a separate Playwright HTML report retained for seven days. Failed public
browser tests also capture a trace and screenshot. Authentication traces, screenshots, and
videos are disabled to keep credentials and session tokens out of those artifacts.

Releases run sequentially and are not automatically canceled by a newer release. Each Worker
version is tagged with the Git commit SHA. The two deployments are **not atomic**: if the SPA
upload fails, the API may already be live. Browser warnings leave both deployed versions in place.
Correct the problem and rerun;
to return to an earlier release, run the workflow against a known-good tag, or roll back both
Workers to the matching commit versions in Cloudflare. Future API changes should remain
compatible with the previous SPA while a release is in progress.

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
always run in the deployment workflow, but its failure is advisory. Use the [development account](development-admin.md)
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
Prefer the workflow for a coordinated release, since local files may still point at local services.
