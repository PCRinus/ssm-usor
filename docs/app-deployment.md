# Deploy the application and API

The manual GitHub Actions workflow **Deploy app** (`.github/workflows/deploy-app.yml`)
deploys two Cloudflare Workers from the same selected Git revision:

| Worker         | Custom domain    | Purpose                                         |
| -------------- | ---------------- | ----------------------------------------------- |
| `ssm-usor-api` | `api.ssmusor.ro` | Hono API and Supabase bearer-token verification |
| `ssm-usor-app` | `app.ssmusor.ro` | React SPA and static assets                     |

Both disable `workers.dev` routes. Cloudflare creates the custom-domain DNS records and
certificates on deployment in the account hosting the active `ssmusor.ro` zone. Resolve any
conflicting records for these two subdomains before the first release. Marketing's deployment
and Basic Auth settings are independent; see the [marketing deployment guide](deployment.md).

## One-time GitHub configuration

In **Settings → Environments**, create `app-production`. Add these environment values:

| Name                            | Kind     | Value                                                                                            |
| ------------------------------- | -------- | ------------------------------------------------------------------------------------------------ |
| `CLOUDFLARE_ACCOUNT_ID`         | Variable | Account hosting the `ssmusor.ro` zone; same account as marketing.                                |
| `CLOUDFLARE_API_TOKEN`          | Secret   | Deployment token authorized to edit Workers and their custom-domain routes in this account/zone. |
| `VITE_SUPABASE_URL`             | Variable | `https://xvhiwymggufbvjdfywjg.supabase.co` for the current project.                              |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Variable | The project's `sb_publishable_…` key from Supabase **Settings → API Keys**.                      |

Repository-level variables and secrets also work. Values scoped only to marketing's
`design-preview` environment are unavailable to `app-production`. GitHub cannot reveal an
existing secret for copying; use the original Cloudflare token or create another suitable
token. The Cloudflare **Edit Cloudflare Workers** token template is a starting point; scope it
to the account and zone hosting this project, as described in the marketing deployment guide.

The workflow fixes `VITE_API_URL` to `https://api.ssmusor.ro`; no GitHub variable is needed
for it. It builds the public Supabase settings into the SPA and passes the same settings to
the API as `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`. These are public configuration,
not administrator credentials. No Supabase secret/service-role key or seed credentials
belong in this workflow.

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
5. It deploys the SPA, checks `/login`, direct `/dashboard` navigation, and its JavaScript asset.
6. Open `https://app.ssmusor.ro`, sign in with an existing Supabase user, confirm the API
   account details load, refresh `/dashboard`, and sign out.

The smoke checks retry briefly while a new domain becomes available. If initial DNS or
certificate provisioning takes longer, inspect Cloudflare's domain status and rerun the
workflow once ready. The checks do not prove a successful user login; step 6 verifies that
separately without storing a user's credentials in CI. No user is seeded during deployment.

Releases run sequentially and are not automatically canceled by a newer release. Each Worker
version is tagged with the Git commit SHA. The two deployments are **not atomic**: if the SPA
upload or a later check fails, the API may already be live. Correct the problem and rerun;
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

Run the same smoke checks against a deployment:

```bash
node scripts/smoke-deployment.mjs api https://api.ssmusor.ro https://app.ssmusor.ro
node scripts/smoke-deployment.mjs app https://app.ssmusor.ro
```

For manual deployment, authenticate with `pnpm --filter @ssm-usor/api exec wrangler login`,
build `@ssm-usor/contracts`, and configure the API's deployed Supabase bindings before
`pnpm deploy:api`. Build the SPA with all three production `VITE_*` values before publishing
via `pnpm deploy:app`; this command builds using the current shell and local env files.
Prefer the workflow for a coordinated release, since local files may still point at local services.
