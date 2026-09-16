# Marketing deployment and Wrangler

For the React SPA and Hono API, see the [application deployment guide](app-deployment.md).

The marketing site is deployed as a Cloudflare Worker with Static Assets. Astro generates the
files in `apps/marketing/dist`, while `apps/marketing/src/worker.ts` runs before every asset request
and requires temporary HTTP Basic Auth credentials.

The Basic Auth layer temporarily protects the pre-launch marketing site. It is not the
authentication model for the future SaaS application and should be removed when the landing page
is ready for public access.

## GitHub environment

Use the GitHub Actions environment named `production` under **Settings → Environments**.
It is shared with the API and SPA deployment workflow, including the Cloudflare account ID,
deployment token, and environment protection rules. The workflows keep separate triggers and
concurrency groups; sharing the environment does not require deploying them together.

Add these environment variables under **Environment variables**:

| Variable                | Purpose                                                     |
| ----------------------- | ----------------------------------------------------------- |
| `BASIC_AUTH_USERNAME`   | Non-sensitive username deployed as a plain Worker variable. |
| `CLOUDFLARE_ACCOUNT_ID` | Selects the Cloudflare account that owns the Worker.        |

Add this value under **Environment secrets**:

| Secret                 | Purpose                                                               |
| ---------------------- | --------------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN` | Allows Wrangler to deploy the marketing Worker and its static assets. |

Set `BASIC_AUTH_PASSWORD` directly as an encrypted Worker secret before the first deployment. The
deployment pipeline deliberately does not upload it again on every run: Wrangler preserves remote
secrets, and avoiding redundant secret updates prevents an extra secret-only Worker version from
appearing beside each code deployment.

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

The deployment workflow runs after the `CI` workflow succeeds for a push to `main`. It can also be
started manually from the Actions tab. GitHub passes the Basic Auth username as a plain Worker
variable; the independently managed password remains encrypted in Cloudflare.

Each deployment is annotated with the sanitized commit subject and short commit SHA. Cloudflare
uses the subject as the version/deployment message and the SHA as the version tag, making CI
deployments identifiable in the Worker version history.

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

The protected marketing Worker is attached to `ssmusor.ro` as a Cloudflare Workers Custom Domain.
Wrangler creates the corresponding DNS records and Cloudflare provisions TLS, so do not create a
competing `A`, `AAAA`, or `CNAME` record for that hostname manually. The future dashboard can use
`app.ssmusor.ro` when it is ready for deployment.

## First deployment

1. Confirm the `production` GitHub environment contains both variables and the API token secret
   listed above.
2. Set the encrypted Worker password once with
   `pnpm --filter @ssm-usor/marketing exec wrangler secret put BASIC_AUTH_PASSWORD`.
3. Push `main` to GitHub. The CI workflow validates the revision, then the deployment workflow runs
   automatically after CI succeeds.
4. Follow **Actions → Deploy marketing site** until the deployment completes.
5. Open `https://ssmusor.ro` and authenticate with the configured Basic Auth credentials.

The first Custom Domain certificate can take a few minutes to become available. Before the initial
deployment, Cloudflare showing **No Workers connected** for the zone is expected; the workflow
creates the Worker, so no Worker needs to be created manually in the dashboard.

## Local development and preview

For normal landing-page work, use Astro's development server. This is the fastest feedback loop and
does not include the Basic Auth Worker:

```bash
nvm use
pnpm install
pnpm dev:marketing
```

To reproduce the deployed Cloudflare Worker locally, create a gitignored development secret file
and run the Worker preview:

```bash
cp apps/marketing/.dev.vars.example apps/marketing/.dev.vars
# Replace both placeholder values in apps/marketing/.dev.vars.
pnpm preview:marketing
```

Wrangler builds the Astro site and serves the Worker plus static assets at `http://localhost:8788`.
Unlike `astro preview`, this route exercises Basic Auth and the Worker runtime.

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

For the first local deployment, set the remote password interactively, then deploy the username as a
non-secret Worker variable:

```bash
pnpm --filter @ssm-usor/marketing build
pnpm --filter @ssm-usor/marketing exec wrangler secret put BASIC_AUTH_PASSWORD
pnpm --filter @ssm-usor/marketing exec wrangler deploy --var BASIC_AUTH_USERNAME:designer
```

Replace `designer` with the same value configured in the GitHub environment. The Wrangler
configuration keeps remotely managed variables, so later local deployments preserve both values:

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
