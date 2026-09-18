# Marketing deployment and Wrangler

For the React SPA and Hono API, see the [application deployment guide](app-deployment.md).

The marketing site is deployed as a Cloudflare Worker with Static Assets. Astro generates the
files in `apps/marketing/dist`, while `apps/marketing/src/worker.ts` redirects HTTP to HTTPS and
serves those assets publicly. The existing `X-Robots-Tag: noindex, nofollow, noarchive` header
remains in place while the site is being developed.

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
  Worker hostname.

The official template also grants **User Details → Read** and **Memberships → Read**, which improve
Wrangler's account discovery and diagnostics. Because this workflow passes an explicit account ID,
start without those user scopes and add them only if Wrangler reports an account-discovery error.

The marketing site does not currently need Workers KV, R2, D1, DNS Edit, or Zone Settings Edit.
Start with the official template if the custom-token UI or the first deployment rejects the minimal
set, then tighten the token after deployment is working.

The marketing deployment job runs in **CI** after validation and production builds succeed on
`main`, only when marketing or one of its shared inputs changes. It downloads the validated
Worker bundle and static assets instead of rebuilding. See [CI/CD](ci-cd.md) for selection,
caching, and failed-release recovery.

Each deployment is annotated with the sanitized commit subject and short commit SHA in its
message, built by the shared `.github/actions/deployment-message` action that the mail, API,
and SPA deployments use too. The version tag is the full commit SHA on all four Workers.
A version that only uploads a secret carries no message; the dashboard lists it next to the
annotated one.

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

Locally, copy `apps/marketing/.env.example` to `.env`: it holds Cloudflare's test site key,
which always passes and pairs with the test secret in `apps/api/.dev.vars.example`. Run
`pnpm dev:api` and `pnpm dev:mail` next to the site; the confirmation link is printed by the
mail Worker. The pages under `/abonare/` are where that link lands; they are `noindex` and
left out of the sitemap. When the consent sentence changes, bump `waitlist.consentVersion` in
`copy.ts`, because the version is stored with every subscription.

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
