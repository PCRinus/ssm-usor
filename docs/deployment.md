# Marketing deployment and Wrangler

For the React SPA and Hono API, see the [application deployment guide](app-deployment.md).

The marketing site is deployed as a Cloudflare Worker with Static Assets. Astro generates the
files in `apps/marketing/dist`, while `apps/marketing/src/worker.ts` redirects HTTP to HTTPS and
serves those assets publicly. Search engines may index production only: `SEARCH_INDEXING` in
`wrangler.jsonc` is `allow` for production and `block` for `non-prod`. Production serves a
`robots.txt` that allows crawling and names the sitemap; any other deployment, or one without the
variable, answers every request with `X-Robots-Tag: noindex, nofollow, noarchive` and a
`robots.txt` that disallows everything. The `/abonare/` pages carry their own `noindex` meta tag
everywhere.

## GitHub environment

Use the GitHub Actions environment named `production` under **Settings → Environments**.
It is shared by the production build and deployment jobs in **CI**, including the Cloudflare
account ID, deployment token, and environment protection rules. Each application is selected
independently; sharing the environment does not require deploying them together.

Add these environment variables under **Environment variables**:

| Variable                | Purpose                                              |
| ----------------------- | ---------------------------------------------------- |
| `CLOUDFLARE_ACCOUNT_ID` | Selects the Cloudflare account that owns the Worker. |

Add this value under **Environment secrets**:

| Secret                 | Purpose                                                               |
| ---------------------- | --------------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN` | Allows Wrangler to deploy the marketing Worker and its static assets. |

No marketing runtime variables or secrets are required. Previous Basic Auth values in GitHub,
Cloudflare, or local `.dev.vars` files are unused and can be removed after the public version
has been deployed.

## Create the Cloudflare API token

The simplest supported setup is:

1. In Cloudflare, open **My Profile → API Tokens**.
2. Select **Create Token**.
3. Find **Edit Cloudflare Workers** and select **Use template**.
4. Name it `ssm-usor-github-actions`.
5. Under **Account Resources**, include only the account that owns this project.
6. After `ssmusor.ro` has been added to Cloudflare, restrict **Zone Resources** to that zone rather
   than all zones.
7. Do not add an IP-address restriction because GitHub-hosted runners do not have one stable egress
   IP. An expiry date is optional; if one is added, schedule token rotation before it expires.
8. Create the token and copy its value immediately into the GitHub environment secret
   `CLOUDFLARE_API_TOKEN`. Cloudflare displays it only once.

The template includes more storage permissions than the current site uses. A tighter custom token
can use these permissions:

- **Account → Workers Scripts → Edit** for the one project account;
- **Account → Account Settings → Read** for that account;
- **Zone → Workers Routes → Edit** for `ssmusor.ro`, required when Wrangler creates the custom
  Worker hostname;
- **Account → Queues → Edit** for that account, required by the API deployment, which creates
  the `ssm-usor-regeneration`, `ssm-usor-import` and `ssm-usor-import-dead-letter` queues when
  they are missing (see below).

The official template also grants **User Details → Read** and **Memberships → Read**, which improve
Wrangler's account discovery and diagnostics. Because this workflow passes an explicit account ID,
start without those user scopes and add them only if Wrangler reports an account-discovery error.

The marketing site does not currently need Workers KV, R2, D1, DNS Edit, or Zone Settings Edit.
The API needs three Cloudflare Queues, which it consumes: `ssm-usor-regeneration` for bulk
regeneration ([ADR 017](architecture/adr-017-legislation-monitoring.md)), `ssm-usor-import` for
imports from documents ([ADR 030](architecture/adr-030-import-from-documents.md)), both of which
it also sends to, and `ssm-usor-import-dead-letter`, where the import queue puts a message whose
every delivery died before recording a failure. Each has `-non-prod` after it in non-prod.
`wrangler deploy` refuses a Worker bound to a queue that does not exist, so the API deployment
job looks them up and creates the missing ones first; on a new account the first API deployment
creates them. To create them by hand instead:

```bash
pnpm --filter @ssm-usor/api exec wrangler queues create ssm-usor-regeneration
pnpm --filter @ssm-usor/api exec wrangler queues create ssm-usor-import
pnpm --filter @ssm-usor/api exec wrangler queues create ssm-usor-import-dead-letter
```

The regeneration consumer takes up to 4 messages per batch, runs at most 3 batches at once, and
retries a failed message 3 times, 30 seconds apart. The import consumer takes one message per
batch, since a message can wait minutes on a model, runs at most 10 at once, and retries the same
way. The last delivery records the client, the file or the import as failed itself. An import
message whose invocation ran out of memory or time cannot, so after its last delivery it goes to
the dead-letter queue, whose consumer records the failure. `wrangler dev` runs the queues locally, so `pnpm dev` and
`pnpm dev:local` need nothing more. The API Worker also has a daily cron, the clean-up of
imports (02:41 UTC in production, 03:11 in non-prod).
Start with the official template if the custom-token UI or the first deployment rejects the minimal
set, then tighten the token after deployment is working.

The marketing deployment job runs in **CI** after validation and production builds succeed on
`main`, only when marketing or one of its shared inputs changes. It downloads the validated
Worker bundle and static assets instead of rebuilding. See [CI/CD](ci-cd.md) for selection,
caching, and failed-release recovery.

Each deployment is annotated with the sanitized commit subject and short commit SHA in its
message, built by the shared `.github/actions/deployment-message` action that every Worker
deployment uses. The version tag is the full commit SHA on all of them.
A version that only uploads a secret carries no message; the dashboard lists it next to the
annotated one.

## AI Gateway for the update draft

**Deploy production** drafts each release's update with Claude Haiku 5.5 through
[Cloudflare AI Gateway](https://developers.cloudflare.com/ai-gateway/), paid from the account's
prepaid AI Gateway credits (Unified Billing), so no Anthropic account or key exists anywhere
([ADR 026](architecture/adr-026-updates-and-release-review.md)). Without the settings below the
release still goes out, with the first item as its headline. To set it up once:

1. In the Cloudflare dashboard, open **AI → AI Gateway** and select **Create Gateway**. Name it
   `ssm-usor`, keep **Authenticated Gateway** on and log collection on; caching and rate limiting
   stay off. The gateway can also be created with the API, with a token holding
   **AI Gateway → Edit**.
2. On the same page, under **Credits Available**, select **Manage** and top up. One release costs
   well under a cent; a small balance with auto top-up off lasts years.
3. In **My Profile → API Tokens**, create a custom token named `ssm-usor-release-notes` with the
   single permission **Account → AI Gateway → Run** for this account. Any token with that
   permission can call every gateway in the account, so it gets nothing else and is kept apart
   from the deployment token.
4. In the GitHub repository settings, add the variable `AI_GATEWAY_URL` with the value
   `https://gateway.ai.cloudflare.com/v1/<account id>/ssm-usor` and the secret `AI_GATEWAY_TOKEN`
   with the token's value. Both are repository-level, not environment-level: the job that drafts
   the update runs before any environment is chosen.

### The same gateway for imports from documents

Imports from documents ([ADR 030](architecture/adr-030-import-from-documents.md)) reach OpenAI's
models through the same gateway, from the API Worker. The deploy workflow uploads the repository
variable `AI_GATEWAY_URL` and the secret `AI_GATEWAY_TOKEN` to the API Worker of both
environments when they are set; without them, creating or starting an import answers `503` with
the reason `import_unavailable`, and everything else works. Once, by hand:

1. Keep the variable `AI_GATEWAY_URL` above; the API appends `/openai/chat/completions` to it.
2. The token above only runs the gateway, which is all the API needs, so the same secret
   `AI_GATEWAY_TOKEN` serves both. A token of its own for the API, say `ssm-usor-api-import`, is
   the alternative when the two should be rotated apart: then the secret moves to the
   `non-prod` and `production` GitHub environments under the same name, which take precedence
   over the repository's.
3. On the gateway's **Settings**, keep log collection on and set log retention to 30 days, as
   ADR 030 promises in the data processing agreement.
4. OpenAI is paid from the same credits (Unified Billing): no OpenAI account or key is needed.
   A client costs about $0.13; watch the gateway's analytics, filtered by the request metadata
   `organizationId`, for the cost per organization.
5. Run **Deploy production** or merge to `main`, which uploads both to the API Worker.

The API's import also needs the extractor in `apps/pdf` (the `EXTRACTOR` binding), which the PDF
Worker's deployment provides.

The import's review shows a debugging line with the import's cost and tokens to everyone outside
production and, in production, to platform admins only. The API tells the two apart by the
variable `ENVIRONMENT`, which the deploy workflow sets to the GitHub environment's name,
`production` or `non-prod`, beside `OBLIO_DOCUMENTS`, and not in `wrangler.jsonc`, whose top level
is production's and is what `wrangler dev` reads. A Worker without it counts as outside
production, so a production API deployed by any other way must be given `ENVIRONMENT=production`
or every member sees the line.

The request goes to the gateway's Anthropic endpoint unchanged, so the model, the effort and the
structured output are set in `packages/release-notes/scripts/draft.ts` and `claude.ts`, and the
instructions the model follows are `packages/release-notes/prompts/update-draft.md`, whose voice
sections can be edited without touching code; the gateway's own logs show every call, its tokens
and its cost. To rotate the token, create a new
one, replace the secret, then delete the old token.

## Connect `ssmusor.ro` to Cloudflare

The domain remains registered with RoTLD. Connecting it to Cloudflare changes only its authoritative
DNS provider; it does not transfer ownership or registration away from RoTLD.

1. In Cloudflare, open **Domains**, select **Onboard a domain**, and enter `ssmusor.ro`.
2. Choose the Free plan unless another Cloudflare plan is already needed.
3. Review Cloudflare's DNS scan. Before changing nameservers, manually recreate any missing website,
   mail, verification, SPF, DKIM, DMARC, or CAA records. This is especially important if email is
   added before the nameserver change.
4. Confirm DNSSEC is disabled at RoTLD before changing nameservers. After Cloudflare activates the
   zone, DNSSEC can be enabled in Cloudflare and its DS record added through RoTLD.
5. Copy the two authoritative nameservers assigned by Cloudflare. They are unique to the zone.
6. Open RoTLD's **Domenii .ro → Administrare On-Line** interface, select `ssmusor.ro`, and replace
   its nameservers with the two Cloudflare values exactly as provided.
7. Return to Cloudflare and wait for the zone status to become **Active**. Cloudflare advises that a
   nameserver update can take up to 24 hours.

The marketing Worker is attached to `ssmusor.ro` as a Cloudflare Workers Custom Domain.
Wrangler creates the corresponding DNS records and Cloudflare provisions TLS, so do not create a
competing `A`, `AAAA`, or `CNAME` record for that hostname manually. The SPA and API use
`app.ssmusor.ro` and `api.ssmusor.ro` through their separate Workers.

## First deployment

1. Confirm the `production` GitHub environment contains the account ID variable and API token secret
   listed above.
2. Push a marketing or shared-build-input change to `main`. CI validates the revision, builds
   the selected applications, then deploys marketing automatically.
3. Follow **Actions → CI → Deploy marketing site** until the deployment completes.
4. Open `https://ssmusor.ro`; the site is available without credentials.

The first Custom Domain certificate can take a few minutes to become available. Before the initial
deployment, Cloudflare showing **No Workers connected** for the zone is expected; the workflow
creates the Worker, so no Worker needs to be created manually in the dashboard.

## Waitlist form

The "Anunță-mă când se deschid conturile" form (`src/components/site/WaitlistForm.astro`) posts to
the API's [waitlist](api.md#waitlist) and is protected by Cloudflare Turnstile. Two public
settings are read at build time:

| Name                        | Value                                                                      |
| --------------------------- | -------------------------------------------------------------------------- |
| `PUBLIC_TURNSTILE_SITE_KEY` | The widget's site key. Without it the form is replaced by the mailto link. |
| `PUBLIC_API_URL`            | Defaults to `https://api.ssmusor.ro`.                                      |

To switch the form on in production, create a Turnstile widget for `ssmusor.ro` in the
Cloudflare dashboard (managed mode), save its site key as the `TURNSTILE_SITE_KEY` variable
and its secret as the `TURNSTILE_SECRET_KEY` secret of the `production` environment, then
redeploy marketing and the API. Turnstile's script loads only when a visitor focuses the form.

The same widget guards sign-in: Supabase Auth's CAPTCHA checks a token from it on every
password sign-in, signup, reset-link request and portal code request (ADR 004). Its domains,
`ssmusor.ro` and `non-prod.ssmusor.ro`, cover the `app.` and `portal.` subdomains. The SPA and
the portal are built with `TURNSTILE_SITE_KEY` as `VITE_TURNSTILE_SITE_KEY`, and the
**Deploy Supabase configuration** job pushes `TURNSTILE_SECRET_KEY` to the hosted project
through the `[remotes.*]` blocks of `supabase/config.toml`. Replacing the widget means changing
both values and redeploying the SPA, the portal and the configuration together.

Locally, copy `apps/marketing/.env.example` to `.env`: it holds Cloudflare's test site key,
which always passes and pairs with the test secret in `apps/api/.dev.vars.example`. Run
`pnpm dev:api` and `pnpm dev:mail` next to the site; the confirmation link is printed by the
mail Worker. The pages under `/abonare/` are where that link lands; they are `noindex` and
left out of the sitemap. When the consent sentence changes, bump `waitlist.consentVersion` in
`copy.ts`, because the version is stored with every subscription.

## Analytics

The site sends page views, Web Vitals and a few named events to the same EU PostHog project as
the SPA, through the managed proxy `e.ssmusor.ro`, in PostHog's cookieless mode: nothing is
stored in the visitor's browser, and PostHog derives a daily visitor id on its servers from the
IP address, the user agent and a rotating salt, then drops the IP. The project setting
**Cookieless server hash mode** (Project settings, Web analytics) must stay on, or every event
from the site is dropped. Autocapture, session replay, surveys, feature flags and exception
capture are off; nobody is ever identified. `src/lib/analytics.ts` holds the setup.

| Name                           | Value                                                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `PUBLIC_POSTHOG_PROJECT_TOKEN` | The project's public token, from the `VITE_POSTHOG_PROJECT_TOKEN` variable. Without it nothing is sent. |

Events are sent only from `ssmusor.ro`. Opening the site once with `?analytics=off` keeps that
browser out of the numbers (PostHog has no cookie to filter the owner's own visits on, so the
choice lives in the site's own local storage); `?analytics=on` makes a local build with a token
send, for trying changes; `?analytics=auto` forgets the choice.

Named events, all without personal data:

| Event                                              | When                                                                      |
| -------------------------------------------------- | ------------------------------------------------------------------------- |
| `cta_clicked` (`target`, `placement`)              | A login or "Anunță-mă" link is clicked, with where on the page it was.    |
| `section_viewed` (`section`)                       | A section with an id is a third visible, once per page view.              |
| `faq_opened` (`question`)                          | A question of the FAQ is expanded.                                        |
| `waitlist_started`, `waitlist_submitted`           | The form is focused for the first time; the form is submitted.            |
| `waitlist_succeeded`, `waitlist_failed` (`reason`) | The API accepted the address, or not: `challenge`, `rejected`, `network`. |
| `waitlist_confirmed`                               | The confirmation page after the emailed link is opened.                   |

Conversion is `waitlist_confirmed`; the funnel runs through the five waitlist events.

## Legislation Worker

The daily legislation check ([ADR 017](architecture/adr-017-legislation-monitoring.md)) is the
`ssm-usor-legislation` Worker in `apps/legislation`. Its entry is a cron trigger, `17 3 * * *`
in `wrangler.jsonc`: 03:17 UTC, 05:17 in Bucharest in winter and 06:17 in summer. To change the
time, change the file and deploy. It also has the custom domain `legislation.ssmusor.ro`, where
it serves one thing, `POST /run`, to [run the check by hand](#running-the-check-by-hand), and
no `workers.dev` address. Wrangler creates the hostname's DNS record and certificate on deploy,
as for `api.ssmusor.ro`, with the same token's **Zone → Workers Routes → Edit**; do not create
a record for it by hand.

It reads every watched act on the Portal Legislativ, records newer consolidated forms, and
logs each run in `legal_check_runs` ([data model](data-model.md#legislation)). The portal
refuses requests from Cloudflare's network, so the Worker reads it through a relay on
Mircea's home server, reached through his Cloudflare Tunnel at
`https://legislation-relay.home-server.me` and guarded by a Cloudflare Access service token.
The relay passes each request on to the portal and its answer back unchanged; it holds no
secrets. Its address is `LEGISLATION_RELAY_ORIGIN` in `wrangler.jsonc`. The other values are set by the
**Deploy legislation Worker** job from the `production` environment:

| Worker value                      | Kind     | From                                                                                         |
| --------------------------------- | -------- | -------------------------------------------------------------------------------------------- |
| `SUPABASE_URL`                    | Variable | The `VITE_SUPABASE_URL` variable, as for the API                                             |
| `SUPABASE_SECRET_KEY`             | Secret   | The `SUPABASE_SECRET_KEY` secret: the cron writes past row-level security                    |
| `LEGISLATION_RELAY_CLIENT_ID`     | Secret   | The `LEGISLATION_RELAY_CLIENT_ID` secret, sent to the relay as `CF-Access-Client-Id`         |
| `LEGISLATION_RELAY_CLIENT_SECRET` | Secret   | The `LEGISLATION_RELAY_CLIENT_SECRET` secret, sent to the relay as `CF-Access-Client-Secret` |
| `LEGISLATION_RUN_SECRET`          | Secret   | The `LEGISLATION_RUN_SECRET` secret, optional: the bearer token of `POST /run`               |

The job fails when any of the first four is missing. The service token is created by the homelab
repository's Terraform, which also sets up the tunnel route and the Access application; copy
its outputs into the two GitHub secrets, then redeploy the Worker:

```bash
terraform output -raw legislation_relay_client_id
terraform output -raw legislation_relay_client_secret
```

When the token is rotated there, update both secrets and redeploy. When the relay is down,
every act fails and the run says so. Because of `keep_vars`, deleting `LEGISLATION_RELAY_ORIGIN` from
`wrangler.jsonc` would leave the deployed value in place: going back to direct reads means
setting it to `https://legislatie.just.ro` and dropping the token from the job and the Worker,
since the Worker refuses to send the token to the portal itself.

A run takes about four minutes, most of it the two-second pause between requests to the
portal; that is wall time, which a cron invocation may spend up to fifteen minutes of, while
the 30-second CPU limit counts only the parsing. It makes about two hundred subrequests, within
the Workers Paid limit.

A failed run shows three ways: the row in `legal_check_runs` says `failed`, with one error per
act it could not read; the invocation is marked failed under the Worker's **Cron Events** in
the Cloudflare dashboard; and its log, with one line per act, is in the Worker's
observability logs. A row left `running` is a run that was cut off.

### Running the check by hand

Cloudflare cannot fire a deployed cron trigger on demand, so the Worker starts the same run on
`POST https://legislation.ssmusor.ro/run`, through the relay like the cron:

```bash
curl -sS -N -X POST https://legislation.ssmusor.ro/run -H "Authorization: Bearer $LEGISLATION_RUN_SECRET"
```

`-N` makes curl print the answer as it arrives. The answer is `200` as soon as the run has
started, and its body is the run's own log: a first line naming the run, one line per act as
it is read, the totals and any failures by cause, and a last line `Run <id> succeeded.` or
`Run <id> failed.`; the outcome is in that line, not in the status. The run takes about four
minutes. Keep curl open until it ends: a run started this way lives as long as the request, so
interrupting curl stops it, and its row stays `running`.

Other answers have an empty body, or one line:

- `401`: the bearer token is missing or wrong;
- `404`: any other path or method, or every request while the Worker has no `LEGISLATION_RUN_SECRET`;
- `409`: a run, by hand or by the cron, is still `running` and started less than fifteen
  minutes ago; the line names it. The cron skips its morning in the same case. A row left
  `running` for longer was cut off and blocks nothing.

The secret is optional, and the deploy job only notes its absence. To set it, generate a value,
save it as the `LEGISLATION_RUN_SECRET` secret of the `production` environment, and redeploy
the Worker (rerun **CI** by hand, or push a change under `apps/legislation`):

```bash
openssl rand -hex 32
```

Keep the same value in your shell or password manager to call `/run`. A Worker secret outlives
the GitHub secret: to turn `/run` off again, delete both, the Worker's with
`pnpm --filter @ssm-usor/legislation exec wrangler secret delete LEGISLATION_RUN_SECRET`.

To run the check from a laptop instead, run `pnpm legislation:check`
([local development](local-development.md#legislation-check)); it does the same work and logs
its run in the same table.

## Local development and preview

For normal landing-page work, use Astro's development server for the fastest feedback loop:

```bash
nvm use
pnpm install
pnpm dev:marketing
```

To stop the Astro-managed dev and preview servers for the marketing workspace:

```bash
pnpm stop:marketing
# Check the dev server without stopping it:
pnpm --filter @ssm-usor/marketing exec astro dev status
```

This runs `astro dev stop` and `astro preview stop` in the marketing workspace. Astro uses
its own server lock files to identify the processes. Dev servers started with `--ignore-lock`
are not tracked by these commands.
Use Ctrl+C in the owning terminal for a Wrangler preview or the full `pnpm dev` session.

To build and serve through the Cloudflare Worker locally, run:

```bash
pnpm preview:marketing
```

This builds the Astro site and serves the Worker plus static assets at `https://localhost:8788`
using a local development certificate. The preview uses HTTPS to match the Worker's redirect
policy. It requires no credential file.

## Local Cloudflare authentication

Wrangler uses an interactive OAuth login on a developer machine:

```bash
pnpm --filter @ssm-usor/marketing exec wrangler login
pnpm --filter @ssm-usor/marketing exec wrangler whoami
```

The login is stored outside the repository. It is separate from the API token used by GitHub
Actions.

## Validate and deploy locally

Validate the Worker bundle and asset configuration without publishing anything:

```bash
pnpm --filter @ssm-usor/marketing build
pnpm --filter @ssm-usor/marketing deploy:dry-run
```

After Cloudflare authentication, build and deploy:

```bash
pnpm deploy:marketing
```

Useful operational commands:

```bash
pnpm --filter @ssm-usor/marketing exec wrangler tail
pnpm --filter @ssm-usor/marketing exec wrangler versions list
pnpm --filter @ssm-usor/marketing exec wrangler rollback
```

`wrangler dev` runs the Worker locally, `wrangler deploy` uploads a new Worker version and its static
assets, `wrangler tail` streams runtime logs, and the versions commands support inspection and
rollback.
