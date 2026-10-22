# ADR 025: A non-production environment beside production

- Status: proposed
- Date: 2026-10-22

## Context

Everything hosted is one environment. The eight Workers run in one Cloudflare account (Workers Paid since 2026-09-18) on `ssmusor.ro` and its subdomains, one Supabase project backs them, and `.github/workflows/deploy.yml` deploys every merge to `main` straight into it under the GitHub environment `production`. That project has only ever held test data, and the testers of the feedback rounds use it.

The people on the waitlist are about to get access, and they will enter their actual clients and employees, national identification numbers included. From then on a merge must not reach them untried, and testing must not happen among their data. An environment of its own for testing was postponed twice in September ([ADR 001](adr-001-web-applications-and-cloudflare.md) made Cloudflare the default and said nothing about environments); this ADR settles its shape.

What is tied to production today: `environment: production` on thirteen deployment jobs and on `seed.yml`; the hostnames in every `wrangler.jsonc` (custom domains, the API's origin and CORS vars, `MAIL_FROM` on `mail.ssmusor.ro`), in `VITE_API_URL` and the E2E URLs of the workflow, and as fallbacks in `apps/api/src/lib/env.ts`; the queue `ssm-usor-regeneration` and the service bindings by Worker name; `[remotes.production]` in `supabase/config.toml`, with the auth hook URIs on `api.ssmusor.ro`; the deploy workflow's "last commit deployed", which is the last successful run on `main`. The GitHub environment `non-production` exists and is empty; `production` holds 11 variables and 19 secrets.

Usage over the thirty days to 2026-10-22, from Cloudflare's analytics: about 14,000 Worker requests and 37 s of CPU, against 10 million and 30 million ms included; container memory 7.9 GiB-hours of the 25 included, nine tenths of it Gotenberg; no queue operations.

## Decision

### Two environments, one copy of the other

**Production** is what the waitlist's users and every later customer use. **Non-production** is where a merge lands first, where the testers work, and where fake data lives. Non-production is a full copy: all eight Workers, the marketing site and the legislation cron included, so that what is tried there is what production runs. Nothing is shared between them that holds data or credentials: database, Storage, secrets, sending domain, analytics project and certificate authority are each the environment's own.

### One Cloudflare account, hostnames under `non-prod.ssmusor.ro`

Non-production runs in the same Cloudflare account as production, on these hostnames:

|              | Production               | Non-production                    |
| ------------ | ------------------------ | --------------------------------- |
| Marketing    | `ssmusor.ro`             | `non-prod.ssmusor.ro`             |
| App          | `app.ssmusor.ro`         | `app.non-prod.ssmusor.ro`         |
| Portal       | `portal.ssmusor.ro`      | `portal.non-prod.ssmusor.ro`      |
| API          | `api.ssmusor.ro`         | `api.non-prod.ssmusor.ro`         |
| Legislation  | `legislation.ssmusor.ro` | `legislation.non-prod.ssmusor.ro` |
| Email sender | `mail.ssmusor.ro`        | `mail.non-prod.ssmusor.ro`        |

A Worker's custom domain must be a zone of the Worker's own account, and making `non-prod.ssmusor.ro` a zone of another account (a subdomain setup) is an Enterprise feature. A second account was therefore possible only on `workers.dev` addresses or on a second domain. `workers.dev` was rejected because emails from non-production would carry links to it, which phishing has made a spam signal, and because Resend still needs the sending domain's records in a zone we own, so the separation would stop at email anyway. A second domain was rejected as one more name to renew and explain for an isolation that, in one account, is lost only at the Cloudflare API token: a token cannot be limited to some Workers, so the token non-production deploys with could deploy production. For one person deploying through GitHub environments that is accepted. This reverses the plan of 2026-09-18 to move production into a new account; the zone, the paid plan, the containers and the queue stay where they are.

Cost: Workers Paid is $5 per account, not per Worker, and the included amounts are shared by all Workers of the account. At the usage above, two environments stay inside them. The containers are the one meter that moves; past the included 25 GiB-hours their memory costs $0.009 per GiB-hour, and with `max_instances: 1` on both the worst case, both awake all month, is about $35. A usage-based billing notification in the Cloudflare dashboard watches both environments.

### Each Worker gets a `non-production` environment in its `wrangler.jsonc`

Each `wrangler.jsonc` keeps production at its top level and gains `env["non-production"]` with the routes, vars, service bindings, queue, containers and Durable Object bindings, which wrangler does not inherit into an environment. Deploying with `--env non-production` names the Worker `ssm-usor-api-non-production` and so on, so the two copies never collide in the account; the queue is `ssm-usor-regeneration-non-production`. `keep_vars` and the vars the workflow supplies work as today, per environment.

`apps/api/src/lib/env.ts` stops falling back to the production origins: an origin missing in non-production must fail loudly, not point at production. The marketing site's login link and API URL become build variables, as `PUBLIC_API_URL` already is. Links to the legal pages on `ssmusor.ro` stay as they are in both environments; there is one set of legal texts. The marketing Worker sends `noindex` in non-production for good, whatever production does later.

### The current Supabase project stays production and is wiped, a new one is non-production

The current project, `xvhiwymggufbvjdfywjg`, stays production and is **wiped completely** before the waitlist arrives. Non-production is a **new Supabase project** in the same organization and region. Nothing on the current project is kept: it holds Mircea's accounts, his test users and one tester's two clients, and that tester agreed to their removal.

A database reset alone is not a wipe: `supabase db reset --linked` rebuilds the schema from the migrations, but the auth users and the Storage files live outside what it drops. The wipe is therefore, in order: every Storage bucket emptied through the Storage API (deleting rows of `storage.objects` would leave the files behind), every auth user deleted through the admin API, the database reset from the migrations, then a check that no user, object or row of the application's tables is left before the administrator is seeded again. The project's backups age out on their own schedule.

Moving production to a new project and turning the current one into non-production was considered, so that nothing of the test period would remain by construction. It was rejected as more work for the same result: production's variables, secrets and auth configuration would all change, while the wipe above, with its check, leaves nothing behind either. Supabase branching was rejected: a persistent branch ties non-production to the Supabase GitHub integration, which applies migrations itself, while two projects keep one pipeline for both environments.

`supabase/config.toml` gains `[remotes.non-production]` with the new project's id, the non-production `site_url` and hook URIs, and the SMS confirmation workaround; `[remotes.production]` is unchanged. The CLI picks the block by the linked project id, so the deploy job links and pushes as today.

What production needs to work comes through the pipeline in both environments: the schema and the built-in test questions are migrations, the document templates are registered by CI, the legislation table is filled by the cron. `seed.yml` takes the environment as an input. In production it creates the administrator's account and organization and nothing else; fake clients are allowed only in non-production, so `SEED_ALLOW_FAKE` moves from production to non-production.

### A merge deploys non-production, a release deploys production

`main` stays the only long-lived branch. A push to `main` deploys non-production; publishing a GitHub release deploys the commit of its tag to production. The deployment jobs move into one reusable workflow that takes the environment as an input, with the URLs as environment variables (`API_URL`, `APP_URL`, `PORTAL_URL`, `MARKETING_URL`), the wrangler environment derived from it, and concurrency groups per environment. `deploy.yml` calls it for non-production on a push; a new `release.yml` calls it for production on `release: published`, and a run by hand of either deploys everything to its environment, as today.

The applications are built per environment, because the SPA, the portal and the marketing site carry the Supabase URL, the API URL and the analytics token in their bundles. A release does not reuse the artifacts of the non-production run.

"What changed since the last deployment" is asked per environment: non-production compares with the last successful run of `deploy.yml` on `main`, as now, and production with the last successful run of `release.yml`. A release whose commit is not on `main`, or did not deploy successfully to non-production, is refused before anything deploys: production only receives what non-production has run.

Releases are tagged by date, `2026.10.23`, and `2026.10.23.2` for a second release that day. A fix that cannot wait is a merge and a release, and carries whatever else `main` holds unreleased; with one branch that is accepted, and it is a reason to release often.

When step 8 of [ADR 017](adr-017-legislation-monitoring.md) lets the legislation Worker open pull requests, only production's does; non-production's would open the same ones a second time.

### Accounts and credentials per environment

| Service           | Non-production                                                                                                                                                                                                                                 |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub            | The `non-production` environment gets the same variable and secret names as `production`. `production` gets a deployment policy that admits `main` and the release tags only, so a workflow run from any other branch cannot read its secrets. |
| Cloudflare        | Same account. One API token is used by both environments.                                                                                                                                                                                      |
| Supabase          | A new project; its own keys, database password and hook secrets.                                                                                                                                                                               |
| Resend            | Same account, a second domain `mail.non-prod.ssmusor.ro` and its own API key, so test mail never weighs on the production domain's reputation.                                                                                                 |
| Twilio            | A subaccount with its own credentials, or none: without them the SMS Worker logs messages instead of sending.                                                                                                                                  |
| PostHog           | A second project in the same organization. The managed proxy `e.ssmusor.ro` serves both, since it routes by project token.                                                                                                                     |
| Turnstile         | The non-production hostname added to the widget, or a widget of its own.                                                                                                                                                                       |
| Signing           | Its own certificate authority and key-encryption key, generated as in [app deployment](../app-deployment.md#rotating-the-signing-keys); a signature made in non-production must not chain to production's authority.                           |
| Legislation relay | A second Cloudflare Access service token on the home server's relay (homelab Terraform), so either environment's can be revoked alone.                                                                                                         |
| E2E               | A test account per environment for the deployment checks.                                                                                                                                                                                      |

### Production is emptied before the waitlist arrives

The order is: non-production stands up on its new project and is seeded with fake data; the current project is wiped and the administrator seeded again; then the waitlist is invited. The tester who had clients on it chooses where to start over. Nothing of the hosted data is migrated, by decision: it is test data only.

## Consequences

- Every change to deployment touches two environments, and a variable or secret added to one must be added to the other. The `Check public application configuration` step and the per-secret warnings already make a missing value visible; they now run per environment.
- `docs/deployment.md`, `docs/app-deployment.md` and `docs/ci-cd.md` describe both environments and the release step; `docs/local-development.md` is unchanged, since local development is neither.
- Cloudflare's dashboard and logs show both environments in one account, told apart by the `-non-production` suffix.
- A merge no longer reaches users by itself. Someone has to publish a release, and production can fall behind `main`; a migration ships to production in the release that carries it, after non-production has run it.
- The Supabase bill gains a project; Cloudflare's stays at $5 plus container overage.

## Order of work

1. This ADR.
2. Configuration per environment: `env["non-production"]` in every `wrangler.jsonc`, `[remotes.non-production]` in `supabase/config.toml`, the origin fallbacks out of `env.ts`, the marketing site's URLs as build variables. Deploys nothing new by itself.
3. The reusable deployment workflow and `release.yml`: deployment per environment, the per-environment baseline, the release check against non-production, `seed.yml`'s environment input. On step 2.
4. Accounts and secrets, by hand, from the table above, with the `non-production` GitHub environment filled; the new Supabase project created; the first non-production deployment by hand, and its seed.
5. The production wipe as above, with its check; the administrator seeded; the first release.
6. The documents of the consequences above.

## Before the waitlist, outside this ADR

Real client data in production makes some items due that were not: the Twilio account is a trial and can only send to verified numbers; the Supabase plan of the production project decides its backups; Resend's plan limits daily sending; the legal review (#61) and the processing agreement page (#62) cover what users will enter.

## Open

- The Supabase plan of the production project, and whether the organization's plan covers a second project.
- Whether Resend's plan allows a second domain, or the plan changes.
